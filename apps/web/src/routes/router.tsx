import { createBrowserRouter, Navigate } from "react-router-dom";

import { BoardPage } from "./BoardPage";
import { LabelsPage } from "./LabelsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/boards/default" replace />,
  },
  {
    path: "/boards/:boardSlug",
    element: <BoardPage />,
  },
  {
    path: "/boards/:boardSlug/labels",
    element: <LabelsPage />,
  },
]);
