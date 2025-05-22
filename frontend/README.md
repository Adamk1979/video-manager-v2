# Video Manager Frontend

This is a modern frontend for the Video Manager application, built with Next.js, TypeScript, and Tailwind CSS.

## Features

- Upload videos with drag-and-drop interface
- Video preview before processing
- Multiple processing options:
  - Video compression with resolution control
  - Format conversion to multiple formats (mp4, webm, mov, avi)
  - Audio removal
  - Poster image generation
- Real-time process status tracking with progress bar
- Responsive design for all device sizes
- Downloadable processed files

## Getting Started

### Prerequisites

- Node.js 18.x or later
- npm or yarn
- Backend service running (see backend directory)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd video-manager/frontend
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Create a `.env.local` file with the backend URL:
```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Running the Development Server

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Building for Production

```bash
npm run build
npm start
# or
yarn build
yarn start
```

## Project Structure

- `/src/app` - Next.js pages and layouts
- `/src/components` - Reusable UI components
- `/src/lib` - Utility functions and API services

## Technologies Used

- [Next.js](https://nextjs.org/) - React framework
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [React Hook Form](https://react-hook-form.com/) - Form validation
- [React Dropzone](https://react-dropzone.js.org/) - File upload functionality
- [Sonner](https://sonner.emilkowal.ski/) - Toast notifications
- [Axios](https://axios-http.com/) - HTTP client

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
