/**
 * Reusable attachments UI: Camera / Gallery / Document buttons, an image
 * thumbnail strip, and a document list — with a shared pinch-to-zoom lightbox.
 *
 * Two modes:
 *  - Persisted: pass `table`, `ownerColumn` and `ownerId`. Picks are written to
 *    the DB immediately and the list re-queries on the global refresh signal.
 *    Use this in detail and edit views where the owner row already exists.
 *  - Pending: pass `pending` + `onPendingChange`. Nothing touches the DB; the
 *    caller persists the items after creating the parent row. Use this in
 *    "Add" modals (a foreign key does not exist yet).
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { Row } from './ui';
import ImageLightbox from './ImageLightbox';
import { all, insert, newId, remove } from '../db';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { nowISO } from '../utils/date';
import { palette } from '../theme';
import {
  captureFromCamera,
  pickFromGallery,
  pickDocuments,
  openDocument,
  isDocument,
  docFilename,
  type PickedAttachment,
} from '../services/attachments';

interface AttachmentRow {
  id: string;
  uri: string;
  label: string | null;
  local_path: string | null;
}

interface Props {
  userId: string;
  title?: string;
  /** Persisted mode (owner already exists). */
  table?: 'asset_images' | 'loan_images' | 'policy_images';
  ownerColumn?: 'asset_id' | 'loan_id' | 'policy_id';
  ownerId?: string | null;
  /** Pending mode (add flow). */
  pending?: PickedAttachment[];
  onPendingChange?: (items: PickedAttachment[]) => void;
}

const AttachmentsSection: React.FC<Props> = ({
  userId,
  title = 'Attachments',
  table,
  ownerColumn,
  ownerId,
  pending,
  onPendingChange,
}) => {
  const theme = useTheme();
  const { refresh } = useApp();
  const [lightbox, setLightbox] = useState<{ uri: string; local_path: string | null } | null>(null);

  const persisted = !!(table && ownerColumn && ownerId);

  // Persisted rows (re-queried on focus / refresh). Empty in pending mode.
  const dbRows = useData<AttachmentRow[]>(() => {
    if (!persisted) return [];
    return all<AttachmentRow>(
      `SELECT id, uri, label, local_path FROM ${table} WHERE ${ownerColumn} = ? ORDER BY created_at`,
      [ownerId!],
    );
  });

  // Normalise both modes into a single display list.
  const items: AttachmentRow[] = persisted
    ? dbRows
    : (pending ?? []).map((p, i) => ({ id: `pending-${i}`, uri: p.uri, label: p.label, local_path: p.local_path }));

  const photos = items.filter((it) => !isDocument(it.label));
  const docs = items.filter((it) => isDocument(it.label));

  const addPicked = (picked: PickedAttachment[]) => {
    if (!picked.length) return;
    if (persisted) {
      const now = nowISO();
      for (const p of picked) {
        insert(table!, {
          id: newId(),
          [ownerColumn!]: ownerId,
          user_id: userId,
          uri: p.uri,
          label: p.label,
          created_at: now,
          local_path: p.local_path,
        });
      }
      refresh();
    } else {
      onPendingChange?.([...(pending ?? []), ...picked]);
    }
  };

  const onCamera = async () => addPicked(await captureFromCamera());
  const onGallery = async () => addPicked(await pickFromGallery());
  const onDocument = async () => addPicked(await pickDocuments());

  const deleteItem = (it: AttachmentRow) => {
    Alert.alert('Delete Attachment', 'Remove this attachment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (persisted) {
            remove(table!, it.id);
            refresh();
          } else {
            const idx = Number(it.id.replace('pending-', ''));
            const next = (pending ?? []).filter((_, i) => i !== idx);
            onPendingChange?.(next);
          }
        },
      },
    ]);
  };

  return (
    <View>
      <Text
        variant="labelSmall"
        style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8, marginBottom: 6, fontWeight: '600' }}
      >
        {title.toUpperCase()}
      </Text>

      {photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
          {photos.map((img) => (
            <View key={img.id} style={{ marginRight: 8, borderRadius: 10, overflow: 'hidden' }}>
              <Pressable onPress={() => setLightbox({ uri: img.uri, local_path: img.local_path })}>
                <Image source={{ uri: img.uri }} style={{ width: 90, height: 90, borderRadius: 10 }} contentFit="cover" />
              </Pressable>
              <Pressable
                style={{ position: 'absolute', top: 3, right: 3, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999 }}
                onPress={() => deleteItem(img)}
              >
                <MaterialCommunityIcons name="close-circle" size={18} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {docs.length > 0 && (
        <View style={{ marginTop: photos.length > 0 ? 12 : 0, gap: 6 }}>
          {docs.map((doc) => {
            const filename = docFilename(doc.label);
            return (
              <View key={doc.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 }}>
                <MaterialCommunityIcons name="file-pdf-box" size={24} color={palette.danger} />
                <Pressable style={{ flex: 1 }} onPress={() => openDocument(doc.uri, filename)}>
                  <Text
                    variant="bodySmall"
                    numberOfLines={1}
                    style={{ color: theme.colors.primary, textDecorationLine: 'underline' }}
                  >
                    {filename}
                  </Text>
                </Pressable>
                <Pressable onPress={() => deleteItem(doc)} style={{ padding: 4 }}>
                  <MaterialCommunityIcons name="delete-outline" size={20} color={palette.danger} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <Row gap={8} style={{ marginTop: items.length > 0 ? 12 : 0 }}>
        <Button compact icon="camera" mode="outlined" onPress={onCamera} style={{ flex: 1, borderRadius: theme.roundness }}>
          Camera
        </Button>
        <Button compact icon="image" mode="outlined" onPress={onGallery} style={{ flex: 1, borderRadius: theme.roundness }}>
          Gallery
        </Button>
        <Button compact icon="file-document-outline" mode="outlined" onPress={onDocument} style={{ flex: 1, borderRadius: theme.roundness }}>
          Document
        </Button>
      </Row>

      <ImageLightbox
        uri={lightbox?.uri ?? null}
        localPath={lightbox?.local_path ?? null}
        onClose={() => setLightbox(null)}
      />
    </View>
  );
};

export default AttachmentsSection;
