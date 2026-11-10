# files Specification

## Purpose
Owns the optional company file storage under `/api/v1/files`: presigned direct-to-bucket uploads with size and MIME limits, the uploader-only confirm step that verifies the stored object before a file becomes visible, the company-scoped file catalog (list, download, delete), the per-company cap on unconfirmed uploads, and the behaviour when object storage is not configured. The periodic removal of abandoned uploads belongs to `background-jobs`.

## Requirements

### Requirement: File storage is an optional feature

The system SHALL enable the files endpoints only when `S3_BUCKET` is configured. Without it the server SHALL boot normally, log an informational note, and answer every `/api/v1/files` request with the JSON 404 route-not-found body. When `S3_BUCKET` is set but `S3_REGION`, `S3_ACCESS_KEY_ID` or `S3_SECRET_ACCESS_KEY` is missing, the server SHALL refuse to start outside local development and only warn on `DEPLOY_ENVIRONMENT=localhost`.

#### Scenario: Storage not configured

- **WHEN** the server runs without `S3_BUCKET` and a client calls any `/api/v1/files` route
- **THEN** the API responds 404 with the route-not-found `message`

#### Scenario: Half-configured storage in a deployed environment

- **WHEN** `S3_BUCKET` is set, a credential variable is missing and `DEPLOY_ENVIRONMENT` is not `localhost`
- **THEN** the server refuses to start

### Requirement: Files routes require company permissions

The system SHALL require an authenticated platform `user` with a company membership for every files route (a superadmin without a company receives 403 `COMPANY_MEMBERSHIP_REQUIRED`), plus the company permission `files.upload` to create and confirm uploads, `files.view` to list and download, and `files.delete` to delete — 403 otherwise. By default owners and admins hold all three; `company_member` holds `files.view` and `files.upload` only.

#### Scenario: Member cannot delete

- **WHEN** a `company_member` calls `DELETE /api/v1/files/:fileId`
- **THEN** the API responds 403

#### Scenario: Superadmin without a company

- **WHEN** a superadmin calls any files route
- **THEN** the API responds 403 with `code: COMPANY_MEMBERSHIP_REQUIRED`

### Requirement: Files are scoped to the caller's company

The system SHALL scope every file lookup to the caller's company and SHALL answer a file of another company with 404 and a `File does not exist` message, never 403. Malformed file ids SHALL answer 422.

#### Scenario: Another company's file

- **WHEN** a caller references a file id that belongs to a different company
- **THEN** the API responds 404 as if the file did not exist

#### Scenario: Malformed id

- **WHEN** the file id is not a UUID
- **THEN** the API responds 422

### Requirement: Upload creation returns a presigned bound URL

The system SHALL accept `POST /api/v1/files` with `{ filename, contentType, sizeBytes }` and answer 201 with `{ file, uploadUrl }`: a new `pending` catalog entry and a presigned PUT URL valid for 300 seconds whose signature binds the declared content type and exact content length. The storage key SHALL be derived server-side from the company id, a fresh file id and a sanitized filename; the catalog SHALL store the sanitized filename. A `file.upload.created` audit line SHALL be written.

#### Scenario: Valid upload request

- **WHEN** an authorized member posts a PNG of 1000 bytes with filename `report.png`
- **THEN** the API responds 201 with a `pending` file and a presigned upload URL

#### Scenario: Upload with a different size or type

- **WHEN** the client PUTs to the presigned URL with a content type or length other than the declared ones
- **THEN** the storage provider rejects the upload because the signature does not match

### Requirement: Upload declarations are validated

The system SHALL answer 422 unless `filename` is a string of 1–255 characters without `/`, `\`, line breaks or NUL; `contentType` is a valid MIME type in the configured allowlist (`S3_ALLOWED_MIME_TYPES`, default common image, PDF, text, CSV, ZIP and Office types), where HTML, SVG and XML types are always excluded even when configured; and `sizeBytes` is an integer from 1 to the configured maximum (`S3_MAX_FILE_SIZE_MB`, default 50 MB).

#### Scenario: Disallowed type

- **WHEN** `contentType` is `image/svg+xml` or `text/html`, or any type outside the allowlist
- **THEN** the API responds 422 and no catalog entry is created

#### Scenario: Oversized declaration

- **WHEN** `sizeBytes` exceeds the configured maximum or is below 1
- **THEN** the API responds 422

#### Scenario: Path in filename

- **WHEN** `filename` contains `/`, `\`, a line break or a NUL character
- **THEN** the API responds 422

### Requirement: Unconfirmed uploads are capped per company

The system SHALL refuse to create a new upload when the caller's company already holds 20 or more `pending` uploads, answering 409 with `code: FILE_PENDING_UPLOAD_LIMIT`. The cap is a brake, not an exact quota: a burst of concurrent requests MAY overshoot it slightly.

#### Scenario: Cap reached

- **WHEN** the company has 20 pending uploads and a member requests another
- **THEN** the API responds 409 with `code: FILE_PENDING_UPLOAD_LIMIT`

### Requirement: Confirm verifies the stored object

The system SHALL publish a pending upload only through `POST /api/v1/files/:fileId/confirm`, answering 200 with `{ file }` in status `ready` (and a `file.upload.confirmed` audit line) after verifying that the stored object exists and its size and content type equal the declared ones. A missing object SHALL answer 409 `FILE_UPLOAD_MISSING` and keep the entry pending; a mismatch SHALL answer 400 `FILE_UPLOAD_MISMATCH`, discard entry and object, and write `file.upload.discarded`.

#### Scenario: Verified upload

- **WHEN** the uploader confirms after a matching PUT
- **THEN** the API responds 200 with the file in status `ready`

#### Scenario: Not uploaded yet

- **WHEN** the uploader confirms before the object exists
- **THEN** the API responds 409 with `code: FILE_UPLOAD_MISSING` and the entry stays pending

#### Scenario: Mismatching object

- **WHEN** the stored object's size or content type differs from the declaration
- **THEN** the API responds 400 with `code: FILE_UPLOAD_MISMATCH` and both entry and object are removed

### Requirement: Only the uploader can confirm a pending upload

The system SHALL answer a confirm of a pending upload by any company member other than its uploader with 404 (`File does not exist`), so others can neither publish nor discard someone else's in-flight upload nor learn it exists. Confirming an already `ready` file SHALL be idempotent for any company caller with `files.upload`, answering 200 with the file.

#### Scenario: Another member confirms

- **WHEN** a member who did not create the pending upload confirms it
- **THEN** the API responds 404 and the entry is unchanged

#### Scenario: Retried confirm

- **WHEN** a confirm is repeated after the file became `ready`
- **THEN** the API responds 200 with the same file

### Requirement: Confirm window ends before cleanup may act

The system SHALL refuse to confirm an upload created 50 minutes or more ago with 409 `FILE_UPLOAD_EXPIRED`, so no row becomes `ready` while the stale-upload cleanup (uploads older than 60 minutes) may be deleting its object. The transition SHALL be conditional on the row still being pending and inside the window; otherwise the answer follows the current state: 200 if a concurrent confirm made it ready, 404 if gone, else 409 `FILE_UPLOAD_EXPIRED`.

#### Scenario: Stale confirm

- **WHEN** the uploader confirms an upload created 55 minutes earlier
- **THEN** the API responds 409 with `code: FILE_UPLOAD_EXPIRED`

#### Scenario: Concurrent confirms

- **WHEN** two confirms of the same valid upload race
- **THEN** both respond 200 with the file in status `ready`

### Requirement: Only ready files are listed

The system SHALL answer `GET /api/v1/files` with 200 and `{ files, nextCursor }` listing only the company's `ready` files newest first, with the shared cursor contract (`limit` 1–100, default 50; `cursor` = last file id; `nextCursor` only on a full page; invalid values 422). Each file SHALL expose `id`, `original_filename`, `mime_type`, `size_bytes`, `status`, `uploaded_by` and `created_at`, never the storage key.

#### Scenario: Pending files hidden

- **WHEN** a company has one ready and one pending file and a member lists files
- **THEN** only the ready file is returned

#### Scenario: Storage key never exposed

- **WHEN** any file is returned by the API
- **THEN** it carries no storage key

### Requirement: Ready files download through a forced-download link

The system SHALL answer `GET /api/v1/files/:fileId/download` with 200 and `{ url }`, a presigned GET valid for 600 seconds that forces a download under the catalog filename and serves the catalog content type. Pending or unknown files SHALL answer 404.

#### Scenario: Download link

- **WHEN** a member requests the download of a ready file
- **THEN** the API responds 200 with a short-lived URL that downloads the file as an attachment

#### Scenario: Download of a pending upload

- **WHEN** a member requests the download of a file that is still pending
- **THEN** the API responds 404

### Requirement: File deletion removes the entry first

The system SHALL delete a company file (pending or ready) with `DELETE /api/v1/files/:fileId`, answering 200 with `{ fileId }` and writing a `file.deleted` audit line. The catalog entry SHALL be removed first and the stored object afterwards on a best-effort basis: a storage failure is logged as a warning and never turns the deletion into an error. A file already deleted, including by a concurrent request, SHALL answer 404.

#### Scenario: Delete a file

- **WHEN** a caller with `files.delete` deletes a company file
- **THEN** the API responds 200 with the `fileId` and the file disappears from the list

#### Scenario: Storage outage during delete

- **WHEN** the object removal fails after the entry was deleted
- **THEN** the API still responds 200 and a warning is logged

#### Scenario: Concurrent deletes

- **WHEN** two deletions of the same file race
- **THEN** one responds 200 and the other 404
