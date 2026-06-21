# Asset Fields Reference Requirement

Refer to the asset screenshots stored in:

```text
E:\FinVault\photos
```

as the source of truth for asset-specific fields, field labels, section names, field ordering, and required/optional status.

Do **not** copy or recreate the browser layout. The current mobile UI layout, styling, spacing, navigation patterns, and component structure should continue to be used.

The screenshots should only be used to determine:

* Which fields belong to each asset type
* The exact field labels
* Section headings
* Required vs optional fields
* Field ordering within each asset type

## Asset Type Changes

The reference screenshots contain the following gold-related asset types:

* Digital Gold
* Physical Gold

The mobile application currently contains an additional asset type named **Gold**, which does not exist in the reference screenshots.

Requirements:

* Remove the separate **Gold** asset type from the mobile application.
* Rename **Digital Gold** to **Gold** throughout the application.
* Preserve all existing Digital Gold fields and functionality under the renamed Gold asset type.
* Any existing assets stored as Digital Gold should continue to function correctly after the rename.
* Physical Gold should remain unchanged and continue to use the fields defined in the reference screenshots.

# Add Asset Requirements

For each asset type, ensure that all fields shown in the reference screenshots are present in the Add Asset flow using the existing mobile design system and layout.

Do not change the current mobile form layout unless required for functionality.

# Asset Details Requirements

When a user selects an asset from the Assets table/list, the Asset Details screen must display all data captured during asset creation.

Requirements:

* Display every field defined for that asset type.
* Use the same field names and section names from the reference screenshots.
* Display uploaded photos, PDFs, and other attachments.
* Ensure no captured asset information is hidden from the user.

# Asset Attachments Requirements

Currently, attachments are added from the Asset Details screen after asset creation using:

* Take Photo
* Select from Gallery
* Upload Document

Keep this workflow.

Requirements:

* Users should be able to upload multiple photos and documents.
* Users should be able to delete uploaded photos and documents.
* When a photo is tapped, it should open in a full-screen image viewer.
* When a document is tapped, it should open using the device document viewer.
* The document name should function as an openable document link and not be displayed as plain text only.
* Attachments should remain accessible from the Asset Details screen, i.e., Users should be able to add more photos and documents to the existing asset from the asset details screen.

# Edit Asset Requirements

The Edit Asset screen must contain the same fields as the corresponding Add Asset form.

Requirements:

* Pre-populate all fields with existing values.
* Preserve the same field names and section names from the reference screenshots.
* Maintain the existing mobile UI design and layout.
* Any field captured during asset creation should be editable unless explicitly restricted by business rules, i.e., Don't allow to change the Asset Type and Asset Name.
* Uploaded photos and documents should be viewable, removable, and replaceable.

# Consistency Requirement

For every asset type, the following screens must remain synchronized:

1. Add Asset
2. Asset Details
3. Edit Asset

Any field available in Add Asset must also be available in Asset Details and Edit Asset.

The reference screenshots should be used only for defining asset-specific fields, labels, sections, and ordering. The existing mobile layout and user experience should remain unchanged.
