# Spec Delta

## ADDED Requirements

### Requirement: Validated fields come from one location

The system SHALL validate and read every request field from exactly one documented location: JSON body fields from the body, list filters and tokens from the query string, ids from the path. A field supplied only in another location SHALL count as missing and answer 422 with the standard validation shape; a copy in another location SHALL be ignored, so validation and the handler always see the same value.

#### Scenario: Body field sent in the query

- **WHEN** a client sends a body field only as a query parameter, with an empty JSON body
- **THEN** the API responds 422 naming that field and no handler logic runs

#### Scenario: Conflicting copy in the query ignored

- **WHEN** a request carries a valid body field and a different value for the same name in the query string
- **THEN** the body value is validated and used and the query value has no effect

#### Scenario: List filter sent in the body

- **WHEN** a list request carries `limit` in a JSON body instead of the query string
- **THEN** the body value is ignored and the default page size applies
