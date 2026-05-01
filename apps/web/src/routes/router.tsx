import { createBrowserRouter, Navigate } from "react-router-dom";

import { BoardEditPage } from "./BoardEditPage";
import { BoardPage } from "./BoardPage";
import { BoardsPage } from "./BoardsPage";
import { LabelsPage } from "./LabelsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/boards/default" replace />,
  },
  {
    path: "/boards",
    element: <BoardsPage />,
  },
  {
    path: "/boards/new",
    element: <BoardEditPage />,
  },
  {
    path: "/boards/:boardSlug/edit",
    element: <BoardEditPage />,
  },
  {
    path: "/boards/:boardSlug",
    element: <BoardPage />,
  },
  {
    path: "/labels",
    element: <LabelsPage />,
  },
]);
