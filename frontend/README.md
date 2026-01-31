# OMS Frontend

This is the frontend application for the OMS (Operations Management System) project. It is a modern single-page application built with React, TypeScript, and Vite, designed to provide a comprehensive interface for managing various operational aspects including administration, staff, grievances, visitors, and more.

## 🚀 Tech Stack

- **Framework:** [React 19](https://react.dev/)
- **Build Tool:** [Vite](https://vite.dev/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **UI Components:** [Radix UI](https://www.radix-ui.com/), [Lucide React](https://lucide.dev/) (Icons)
- **State Management:** [Zustand](https://zustand.docs.pmnd.rs/)
- **Routing:** [React Router DOM](https://reactrouter.com/)
- **Forms:** [React Hook Form](https://react-hook-form.com/)
- **Charts:** [Recharts](https://recharts.org/)
- **Date Handling:** [date-fns](https://date-fns.org/)
- **HTTP Client:** [Axios](https://axios-http.com/)
- **Notifications:** [Sonner](https://sonner.emilkowal.ski/)

## 📂 Project Structure

```
frontend/
├── public/              # Static assets
├── src/
│   ├── assets/          # Project assets (images, fonts, etc.)
│   ├── components/      # Reusable UI components
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Utility functions and API configurations
│   ├── pages/           # Application pages/routes
│   │   ├── admin/       # Admin-related pages
│   │   ├── Auth/        # Authentication pages
│   │   ├── grievances/  # Grievance management pages
│   │   ├── staff/       # Staff management pages
│   │   ├── visitors/    # Visitor management pages
│   │   └── ...          # Other feature pages (Tour, Train, etc.)
│   ├── stores/          # Global state stores (Zustand)
│   ├── types/           # TypeScript type definitions
│   ├── App.tsx          # Main application component
│   └── main.tsx         # Entry point
├── .gitignore           # Git ignore rules
├── index.html           # HTML entry point
├── package.json         # Project dependencies and scripts
├── tailwind.config.ts   # Tailwind CSS configuration
├── tsconfig.json        # TypeScript configuration
└── vite.config.ts       # Vite configuration
```

## 🛠️ Prerequisites

Before you begin, ensure you have met the following requirements:

- **Node.js**: v18 or higher recommended (Check with `node -v`)
- **npm**: v9 or higher (Check with `npm -v`)

## 💻 Installation

1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

## 🏃‍♂️ Running the Application

### Development Server
To start the development server with Hot Module Replacement (HMR):

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or another port if 5173 is busy).

### Production Build
To create a production-ready build:

```bash
npm run build
```

This will generate the built assets in the `dist` directory.

### Preview Production Build
To preview the production build locally:

```bash
npm run preview
```

## 🧪 Linting

To run the linter and check for code quality issues:

```bash
npm run lint
```

## ✨ Key Features

- **Responsive Design:** Optimized for various screen sizes using Tailwind CSS.
- **Admin Dashboard:** Comprehensive tools for system administration.
- **User Management:** Robust authentication and role-based access.
- **Data Visualization:** Interactive charts and graphs using Recharts.
- **Form Handling:** Efficient and accessible forms with validation.
- **Theme Support:** Utilizing `next-themes` for potential light/dark mode support.
