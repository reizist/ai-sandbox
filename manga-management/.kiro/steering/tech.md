# Technology Stack - Manga Database Web Application

## Architecture Overview
Modern full-stack web application built with React-based framework, cloud storage, and database integration for scalable manga management.

## Frontend Stack

### Framework & UI
- **Remix**: Full-stack React framework for server-side rendering and routing
- **React 18**: Component-based UI library with modern hooks and concurrent features
- **TypeScript**: Type-safe development with enhanced developer experience
- **Tailwind CSS**: Utility-first CSS framework for responsive design

### Build & Development
- **Vite**: Fast build tool and development server
- **PostCSS**: CSS processing and optimization
- **ESLint/Prettier**: Code quality and formatting tools

## Backend Stack

### Runtime & Framework
- **Node.js**: JavaScript runtime environment
- **Remix (Server-side)**: Handles API routes, server-side rendering, and data loading
- **TypeScript**: Type-safe server-side development

### Database & ORM
- **Prisma**: Modern database toolkit and ORM
- **SQLite/PostgreSQL**: Database options for development and production
- **Database Schema**: Manga collections, reading progress, metadata storage

### Cloud Services
- **AWS S3**: Object storage for manga files and images
- **S3 SDK**: AWS SDK for JavaScript for S3 operations
- **Cloud Storage**: Scalable file storage with CDN capabilities

## Key Dependencies

### Core Framework
```json
{
  "@remix-run/node": "Latest",
  "@remix-run/react": "Latest", 
  "@remix-run/serve": "Latest",
  "react": "^18.0.0",
  "react-dom": "^18.0.0"
}
```

### Database & Storage
```json
{
  "@prisma/client": "Latest",
  "prisma": "Latest",
  "aws-sdk": "Latest"
}
```

### Styling & UI
```json
{
  "tailwindcss": "Latest",
  "@tailwindcss/forms": "Latest",
  "autoprefixer": "Latest",
  "postcss": "Latest"
}
```

## Development Environment

### Prerequisites
- **Node.js**: v18+ with npm/yarn package manager
- **AWS Account**: For S3 storage configuration
- **Database**: SQLite for development, PostgreSQL for production

### Environment Configuration
```bash
# Required environment variables
DATABASE_URL="file:./dev.db"
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
AWS_REGION="your-aws-region"
S3_BUCKET_NAME="your-s3-bucket"
```

### Development Commands
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Database operations
npx prisma migrate dev
npx prisma studio

# Build for production
npm run build

# Start production server
npm start
```

### Default Ports
- **Development Server**: http://localhost:3000
- **Prisma Studio**: http://localhost:5555
- **API Endpoints**: /api/* routes

## File Structure Patterns

### Application Structure
```
/app
  /routes          # Remix routes (pages and API endpoints)
  /models          # Database models and data access
  /utils           # Utility functions and helpers
  /lib             # Shared libraries and configurations
  /components      # Reusable React components
```

### API Routes Pattern
- `/api/manga-image.$collectionId.$pageIndex.tsx` - Image serving
- `/api/upload-manga.tsx` - File upload handling
- `/api/update-progress.tsx` - Reading progress updates

### Database Models
- **Collection**: Manga collection metadata
- **Progress**: Reading progress tracking
- **User**: User accounts and preferences

## Performance Considerations
- **Image Optimization**: Efficient image loading and caching
- **CDN Integration**: S3 with CloudFront for global content delivery
- **Server-side Rendering**: Fast initial page loads with Remix SSR
- **Progressive Loading**: Lazy loading for manga pages and images
- **Database Indexing**: Optimized queries for manga discovery and progress tracking