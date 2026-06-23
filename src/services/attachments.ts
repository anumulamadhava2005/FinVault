/**
 * Shared attachment helpers used by Assets, Loans and Insurance.
 *
 * These mirror the original Asset Detail implementation so behaviour stays
 * identical across modules: images/documents are copied into a persistent
 * `attachments` directory, and documents are opened with the platform viewer.
 *
 * The pickers here intentionally do NOT touch the database — they return the
 * picked items so callers can either insert immediately (detail/edit views,
 * where the owner row already exists) or hold them in memory and persist after
 * the parent row is created (add views, where a foreign key does not yet exist).
 */
import { Alert, Platform } from 'react-native';
import { File, Directory, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { newId } from '../db';

/** A picked-but-not-yet-persisted attachment. */
export interface PickedAttachment {
  uri: string;
  /** null for images, `pdf:<filename>` for documents. */
  label: string | null;
  local_path: string | null;
}

export const getMimeType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[ext] ?? 'application/octet-stream';
};

const toLocalPath = (uri: string): string =>
  uri.startsWith('file://') ? decodeURIComponent(uri.replace('file://', '')) : uri;

/** Copy a cached pick into a persistent app directory; falls back to the original uri. */
export const copyToPersistentStorage = async (uri: string, originalName?: string): Promise<string> => {
  try {
    const attachmentsDir = new Directory(Paths.document, 'attachments');
    try { attachmentsDir.create({ intermediates: true }); } catch { /* already exists */ }
    const ext = uri.split('.').pop()?.split('?')[0].toLowerCase() || 'jpg';
    const name = originalName || `img_${newId()}.${ext}`;
    const destFile = new File(attachmentsDir, newId() + '_' + name);
    const srcFile = new File(uri);
    await srcFile.copy(destFile);
    return destFile.uri;
  } catch (err) {
    console.warn('Failed to copy to persistent storage, using original cached URI:', err);
    return uri;
  }
};

const makePicked = (uri: string, label: string | null): PickedAttachment => ({
  uri,
  label,
  local_path: toLocalPath(uri),
});

/** Take a photo with the camera. Returns persisted picks (may be empty). */
export const captureFromCamera = async (): Promise<PickedAttachment[]> => {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (perm.status !== 'granted') {
    Alert.alert('Permission required', 'Camera access is needed to take photos.');
    return [];
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled) return [];
  const out: PickedAttachment[] = [];
  for (const a of result.assets) {
    const uri = await copyToPersistentStorage(a.uri);
    out.push(makePicked(uri, null));
  }
  return out;
};

/** Pick one or more images from the gallery. */
export const pickFromGallery = async (): Promise<PickedAttachment[]> => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted') {
    Alert.alert('Permission required', 'Photo library access is needed to pick images.');
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsMultipleSelection: true,
  });
  if (result.canceled) return [];
  const out: PickedAttachment[] = [];
  for (const a of result.assets) {
    const uri = await copyToPersistentStorage(a.uri, a.fileName || undefined);
    out.push(makePicked(uri, null));
  }
  return out;
};

/** Pick one or more documents (PDFs etc). */
export const pickDocuments = async (): Promise<PickedAttachment[]> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (result.canceled || !result.assets?.length) return [];
  const out: PickedAttachment[] = [];
  for (const file of result.assets) {
    const filename = file.name ?? 'document';
    const uri = await copyToPersistentStorage(file.uri, filename);
    out.push(makePicked(uri, `pdf:${filename}`));
  }
  return out;
};

/** True if an attachment row/pick represents a document rather than an image. */
export const isDocument = (label?: string | null): boolean => !!label?.startsWith('pdf:');

/** Strip the `pdf:` prefix to get a display filename. */
export const docFilename = (label?: string | null): string =>
  label?.replace(/^pdf:/, '') ?? 'document';

/** Open a document with the platform viewer (Android intent, else share sheet). */
export const openDocument = async (uri: string, filename: string): Promise<void> => {
  try {
    if (Platform.OS === 'android') {
      const contentUri = await FileSystem.getContentUriAsync(uri);
      try {
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1, // Intent.FLAG_GRANT_READ_URI_PERMISSION
          type: getMimeType(filename),
        });
        return;
      } catch (intentErr) {
        console.warn('Intent view failed, falling back to shareAsync:', intentErr);
      }
    }

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert('Cannot open', 'No document viewer is available on this device.');
      return;
    }
    await Sharing.shareAsync(uri, {
      mimeType: getMimeType(filename),
      dialogTitle: `Open ${filename}`,
      UTI: getMimeType(filename),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('no such file') || msg.includes('not found') || msg.includes('ENOENT')) {
      Alert.alert('File not found', 'This document is no longer available on this device. It may have been deleted.');
    } else {
      Alert.alert('Cannot open', `Unable to open this document: ${msg}`);
    }
  }
};
