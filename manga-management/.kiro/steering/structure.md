# Project Structure - Manga Database Web Application

## Directory Organization

### Root Level Structure
```
manga-management/
├── .kiro/                    # Kiro steering and specifications
│   ├── steering/            # Project steering documents
│   └── specs/               # Feature specifications
├── manga-viewer/            # Main application directory
├── prisma/                  # Database schema and migrations
├── README.md               # Project documentation
└── .gitignore              # Git ignore rules
```

### Main Application Structure (`/manga-viewer/`)
```
manga-viewer/
├── app/                     # Remix application code
│   ├── routes/             # Route components and API endpoints
│   ├── models/             # Database models and data access
│   ├── utils/              # Utility functions
│   ├── lib/                # Shared libraries
│   ├── components/         # React components (if created)
│   ├── styles/             # CSS and styling
│   ├── entry.client.tsx    # Client-side entry point
│   ├── entry.server.tsx    # Server-side entry point
│   └── root.tsx            # Root app component
├── prisma/                 # Database schema
├── public/                 # Static assets
├── package.json            # Dependencies and scripts
├── remix.config.js         # Remix configuration
├── tailwind.config.ts      # Tailwind CSS configuration
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite build configuration
└── .env.example           # Environment variables template
```

## Code Organization Patterns

### Route Structure (`/app/routes/`)
```
routes/
├── _index.tsx                    # Home page (manga library)
├── viewer.$collectionId.tsx      # Manga viewer page
└── api/                         # API endpoints
    ├── manga-image.$collectionId.$pageIndex.tsx
    ├── extract-zip-image.$collectionId.$pageIndex.tsx
    ├── upload-manga.tsx
    └── update-progress.tsx
```

### Model Structure (`/app/models/`)
```
models/
├── manga.server.ts              # Manga-related database operations
├── user.server.ts               # User management (if implemented)
└── progress.server.ts           # Reading progress tracking
```

### Utility Structure (`/app/utils/`)
```
utils/
├── s3.server.ts                 # S3 storage operations
├── s3ZipUpload.server.ts        # Zip file handling for S3
├── image.server.ts              # Image processing utilities
└── validation.ts                # Input validation helpers
```

## Naming Conventions

### Files and Directories
- **Routes**: Use Remix naming conventions (`$` for parameters, `_` for layouts)
- **Components**: PascalCase for React components (`MangaViewer.tsx`)
- **Utilities**: camelCase for utility functions (`imageUtils.ts`)
- **Models**: Descriptive names with `.server.ts` suffix for server-only code
- **Constants**: UPPER_SNAKE_CASE for constants

### Code Naming
- **Variables**: camelCase (`collectionId`, `pageIndex`)
- **Functions**: camelCase (`getMangaCollection`, `updateReadingProgress`)
- **Types/Interfaces**: PascalCase (`MangaCollection`, `ReadingProgress`)
- **Database Models**: PascalCase matching Prisma conventions

### API Endpoints
- **REST Pattern**: Use HTTP verbs appropriately
- **Resource-based URLs**: `/api/manga/`, `/api/collections/`
- **Parameter Naming**: Consistent with database schema (`collectionId`, not `id`)

## Component Architecture

### Page Components
```typescript
// Route components handle data loading and page structure
export async function loader({ params }: LoaderFunctionArgs) {
  // Data loading logic
}

export default function PageComponent() {
  // Page rendering logic
}
```

### Utility Functions
```typescript
// Server utilities marked with .server.ts
export async function uploadMangaToS3(file: File): Promise<string> {
  // S3 upload logic
}

// Client utilities for shared logic
export function formatMangaTitle(title: string): string {
  // Title formatting logic
}
```

## Database Schema Patterns

### Model Naming
- **Tables**: Singular, PascalCase (`Collection`, `Progress`)
- **Fields**: camelCase (`createdAt`, `updatedAt`, `collectionId`)
- **Relations**: Descriptive names (`collections`, `progressRecords`)

### Field Conventions
- **IDs**: Use `id` as primary key, `{model}Id` for foreign keys
- **Timestamps**: `createdAt` and `updatedAt` for audit trail
- **Booleans**: Descriptive names (`isCompleted`, `isPublic`)

## Asset Organization

### Static Assets (`/public/`)
```
public/
├── images/                      # App icons, logos, placeholders
├── fonts/                       # Custom fonts (if any)
└── favicon.ico                  # Site favicon
```

### Styling Structure
```
app/
├── tailwind.css                 # Main Tailwind styles
└── styles/                      # Additional CSS modules (if needed)
    ├── components.css           # Component-specific styles
    └── utilities.css            # Custom utility classes
```

## Configuration Files

### Build and Development
- **`vite.config.ts`**: Vite configuration for build and dev server
- **`remix.config.js`**: Remix-specific configuration
- **`tailwind.config.ts`**: Tailwind CSS customization
- **`tsconfig.json`**: TypeScript compiler configuration
- **`postcss.config.js`**: PostCSS processing configuration

### Environment and Deployment
- **`.env.example`**: Template for environment variables
- **`.gitignore`**: Version control exclusions
- **`package.json`**: Dependencies, scripts, and metadata

## Import Conventions

### Import Order
1. External libraries (`react`, `@remix-run/*`)
2. Internal utilities and models (`~/models/*`, `~/utils/*`)
3. Relative imports (`./`, `../`)

### Path Aliases
```typescript
// Use Remix's ~ alias for app directory
import { getMangaCollection } from "~/models/manga.server";
import { uploadToS3 } from "~/utils/s3.server";
```