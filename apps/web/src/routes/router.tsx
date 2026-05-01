import { createBrowserRouter } from "react-router-dom";

import { BoardEditPage } from "./BoardEditPage";
import { BoardPage } from "./BoardPage";
import { BoardsPage } from "./BoardsPage";
import { HomePage } from "./HomePage";
import { LabelsPage } from "./LabelsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
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
