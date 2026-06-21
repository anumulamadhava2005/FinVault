# Asset Form Field Layout

In the Add Asset and Edit Asset forms, financial fields should not be displayed side-by-side.

Display the following fields one below the other:

* Mutual Fund: Invested Amount, Current Value
* Equity: Invested Amount, Current Value
* Fixed Deposit: Principal Amount, Maturity Value
* Real Estate: Purchase Price, Current Value
* Gold: Invested Amount, Current Value
* PPF: Total Invested Amount, Current Value
* Sovereign Gold Bond: Invested Amount, Current Value

Apply this consistently across Add Asset, Edit Asset, and Asset Details screens.


# Goal Linking Allocation Percentage

In the Asset Details screen, under **Linked Goals**, clicking the **Manage** button currently links the selected asset to a goal with an implicit 100% allocation.

Instead, when linking an asset to a goal:

* Allow the user to specify the percentage allocation of the asset assigned to that goal.
* Display the allocated percentage for each linked goal.
* Ensure the total allocation across all linked goals for an asset does not exceed 100%.
* Show the remaining unallocated percentage, if any.

Example:

* Retirement Goal – 60%
* House Purchase Goal – 30%
* Unallocated – 10%

# Document Viewing Fix

Uploaded documents can be successfully attached to an asset, but attempting to open a document results in the error:

"Failed to open document"

Requirements:

* Fix document viewing functionality.
* Tapping a document should open the document using the device's default document viewer.
* Support common document formats such as PDF, DOC, DOCX, XLS, and XLSX.
* Display a user-friendly error message only if the document genuinely cannot be opened.
* Only ensure this works for documents uploaded after the fix is implemented.
* Preserve the existing upload and delete functionality.

Note: Image viewing is already handled separately and is not part of this requirement.