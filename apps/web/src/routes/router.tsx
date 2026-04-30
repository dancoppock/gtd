import { createBrowserRouter, Navigate } from "react-router-dom";

import { BoardPage } from "./BoardPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/boards/default" replace />,
  },
  {
    path: "/boards/:boardSlug",
    element: <BoardPage />,
  },
]);
