import swaggerJsdoc from 'swagger-jsdoc';
import { SESSION_COOKIE_NAME } from './security.js';

const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Express.js Template API',
      description: 'REST API for the Express.js server template. Interactive documentation is generated from `@openapi` JSDoc annotations declared next to each route definition.\n\nEvery response carries an `X-Request-Id` header: a server-generated UUID that also tags the access-log, audit and error lines of that request. Quote it when reporting a problem. Inbound `X-Request-Id` headers are ignored.',
      version: '1.0.0',
    },
    servers: [
      {
        //* Public origin the "Try it out" requests target (e.g. a tunnel or a
        //* reverse proxy in front of the local API) - localhost otherwise
        url: process.env.API_PUBLIC_ORIGIN_URL || `http://localhost:${process.env.PORT || 3000}`,
        description: process.env.API_PUBLIC_ORIGIN_URL ? 'Public server' : 'Local server',
      },
    ],
    tags: [
      { name: 'Health', description: 'Server health check' },
      { name: 'Docs', description: 'API documentation (local development only)' },
      { name: 'Auth', description: 'Authentication and password management' },
      { name: 'User', description: 'Logged-in user profile management' },
      { name: 'Team', description: 'Company team and invite management' },
      { name: 'Files', description: 'S3-backed company file uploads (only mounted when storage is configured)' },
      { name: 'Billing', description: 'Stripe subscription billing' },
      { name: 'Admin', description: 'Admin-only user management' },
      { name: 'Webhooks', description: 'Inbound third-party webhooks' },
    ],
    components: {
      //* Shared query parameters - the same rules utils/validators/listQueryFields.js
      //* enforces and utils/cursorPagination.js applies
      parameters: {
        SearchQuery: {
          in: 'query',
          name: 'search',
          required: false,
          schema: {
            type: 'string',
            maxLength: 100,
          },
          description: 'Optional case-insensitive partial match (trimmed) - the searched field is named in the endpoint description',
        },
        LimitQuery: {
          in: 'query',
          name: 'limit',
          required: false,
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 50,
          },
          description: 'Page size (default 50, capped at 100)',
        },
        CursorQuery: {
          in: 'query',
          name: 'cursor',
          required: false,
          schema: {
            type: 'string',
            format: 'uuid',
          },
          description: 'Row id to start after (the `nextCursor` of the previous page)',
        },
      },
      //* Shared generic responses. OpenAPI 3.0 ignores siblings of a $ref, so
      //* endpoint-specific descriptions (stable `code` enums, limiter-specific
      //* 429s, per-entity 404s) stay inline in the route blocks
      responses: {
        Unauthorized: {
          description: 'Not authenticated - no valid session cookie',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorMessage',
              },
            },
          },
        },
        Forbidden: {
          description: 'Missing permissions - the caller lacks the platform role, company membership or company permission the route requires',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorMessage',
              },
            },
          },
        },
        NotFound: {
          description: 'The resource does not exist',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorMessage',
              },
            },
          },
        },
        ValidationError: {
          description: 'Validation errors',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ValidationError',
              },
            },
          },
        },
        TooManyRequests: {
          description: 'Rate limited - the route\'s limiter budget is exhausted (see the README rate-limit table)',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorMessage',
              },
            },
          },
        },
      },
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: SESSION_COOKIE_NAME,
          description: 'Session cookie issued by POST /api/v1/auth/login. Authentication is passive — a valid cookie must be present on requests to secured endpoints.',
        },
      },
      schemas: {
        SuccessMessage: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Optional developer-facing text - present only when it adds information beyond the status and payload',
            },
          },
        },
        ErrorMessage: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Optional developer-facing text - present only when it adds information beyond the status and payload (conflict reasons, token expiry, rate limiting, route-404 fallback)',
            },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  msg: { type: 'string' },
                  path: { type: 'string' },
                  location: { type: 'string' },
                },
              },
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: {
              type: 'string',
              format: 'email',
              description: 'The user email (the field is historically named username)',
            },
            password: {
              type: 'string',
            },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['username', 'password', 'companyName'],
          properties: {
            username: {
              type: 'string',
              format: 'email',
              description: 'The user email (the field is historically named username)',
            },
            companyName: {
              type: 'string',
              minLength: 2,
              maxLength: 100,
              description: 'Name of the company created for the registrant (trimmed). The registrant becomes its company owner. Required - a missing, empty or non-string name answers 422',
              example: 'Acme Corp',
            },
            password: {
              type: 'string',
              minLength: 8,
              maxLength: 64,
              description: 'At least one lowercase letter, one uppercase letter and one number',
            },
          },
        },
        PasswordResetRequest: {
          type: 'object',
          required: ['email'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
            },
          },
        },
        RecoverPasswordRequest: {
          type: 'object',
          required: ['newPassword', 'confirmNewPassword', 'passwordResetToken'],
          properties: {
            newPassword: {
              type: 'string',
              minLength: 8,
              maxLength: 64,
            },
            confirmNewPassword: {
              type: 'string',
            },
            passwordResetToken: {
              type: 'string',
              pattern: '^[A-Za-z0-9_-]{43}$',
              description: 'Opaque base64url token from the email link',
            },
          },
        },
        UpdatePasswordRequest: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: {
              type: 'string',
            },
            newPassword: {
              type: 'string',
              minLength: 8,
              maxLength: 64,
            },
          },
        },
        TeamInviteRequest: {
          type: 'object',
          required: ['email', 'roleName'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              maxLength: 254,
            },
            roleName: {
              type: 'string',
              enum: ['company_owner', 'company_admin', 'company_member'],
              description: 'Company role the invitee will receive. The inviter must hold it themselves.',
            },
          },
        },
        UpdateMemberRoleRequest: {
          type: 'object',
          required: ['roleName'],
          properties: {
            roleName: {
              type: 'string',
              enum: ['company_owner', 'company_admin', 'company_member'],
            },
          },
        },
        AcceptInviteRequest: {
          type: 'object',
          required: ['inviteToken', 'password'],
          properties: {
            inviteToken: {
              type: 'string',
              pattern: '^[A-Za-z0-9_-]{43}$',
              description: 'Opaque base64url token from the email link',
            },
            password: {
              type: 'string',
              minLength: 8,
              maxLength: 64,
            },
          },
        },
        FileUploadRequest: {
          type: 'object',
          required: ['filename', 'contentType', 'sizeBytes'],
          properties: {
            filename: {
              type: 'string',
              maxLength: 255,
              description: 'Original file name (display metadata - the storage key is always derived server-side)',
            },
            contentType: {
              type: 'string',
              description: 'MIME type of the file - must be whitelisted via S3_ALLOWED_MIME_TYPES',
            },
            sizeBytes: {
              type: 'integer',
              minimum: 1,
              description: 'Declared file size - capped by S3_MAX_FILE_SIZE_MB',
            },
          },
        },
        File: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            original_filename: {
              type: 'string',
            },
            mime_type: {
              type: 'string',
            },
            size_bytes: {
              type: 'integer',
              description: 'Size declared by the client at upload-request time',
            },
            status: {
              type: 'string',
              enum: ['pending', 'ready'],
              description: 'pending until POST /api/v1/files/{fileId}/confirm verifies the uploaded object',
            },
            uploaded_by: {
              type: 'string',
              format: 'uuid',
              nullable: true,
              description: 'Id of the uploading user - null once that user is deleted (files are company assets)',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
    },
  },
  apis: [
    './server/routers/indexRouter.js',
    './server/routers/docsRouter.js',
    './server/API/v1/routes/**/*.js',
    './server/webhooks/webhooksRouter.js',
  ],
};

export const openapiSpecification = swaggerJsdoc(swaggerOptions);
