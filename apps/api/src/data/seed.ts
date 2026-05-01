import type {
  Board,
  Column,
  Label,
  Ticket,
  TicketPriority,
} from "@gtd/contracts";

export type SeedTicketRecord = Omit<Ticket, "labels"> & {
  labelIds: string[];
};

export type SeedData = {
  boards: Board[];
  columns: Column[];
  labels: Label[];
  tickets: SeedTicketRecord[];
};

function makeTicket(args: {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  priority: TicketPriority;
  uiOrder: number;
  labelIds: string[];
}): SeedTicketRecord {
  const timestamp = new Date().toISOString();

  return {
    ...args,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createSeedData(): SeedData {
  const now = new Date().toISOString();
  const boardId = "board_default";

  const boards: Board[] = [
    {
      id: boardId,
      slug: "default",
      name: "My Board",
      createdAt: now,
      updatedAt: now,
    },
  ];

  const columns: Column[] = [
    {
      id: "col_todo",
      boardId,
      key: "todo",
      name: "Todo",
      position: 0,
    },
    {
      id: "col_in_progress",
      boardId,
      key: "in_progress",
      name: "In Progress",
      position: 1,
    },
    {
      id: "col_done",
      boardId,
      key: "done",
      name: "Done",
      position: 2,
    },
  ];

  const labels: Label[] = [
    {
      id: "label_product",
      boardId,
      name: "product",
      normalizedName: "product",
    },
    {
      id: "label_frontend",
      boardId,
      name: "frontend",
      normalizedName: "frontend",
    },
    {
      id: "label_backend",
      boardId,
      name: "backend",
      normalizedName: "backend",
    },
  ];

  const tickets: SeedTicketRecord[] = [
    makeTicket({
      id: "ticket_1",
      boardId,
      columnId: "col_todo",
      title: "Design ticket modal",
      description: "Sketch the create and edit ticket flow using the shared schema.",
      priority: "high",
      uiOrder: 1_000_000,
      labelIds: ["label_product", "label_frontend"],
    }),
    makeTicket({
      id: "ticket_2",
      boardId,
      columnId: "col_in_progress",
      title: "Build board API route",
      description: "Return board detail, filters, and ticket collections in one response.",
      priority: "highest",
      uiOrder: 2_000_000,
      labelIds: ["label_backend"],
    }),
    makeTicket({
      id: "ticket_3",
      boardId,
      columnId: "col_done",
      title: "Seed default board",
      description: "Pre-create one board with Todo, In Progress, and Done columns.",
      priority: "medium",
      uiOrder: 3_000_000,
      labelIds: ["label_backend", "label_product"],
    }),
  ];

  return {
    boards,
    columns,
    labels,
    tickets,
  };
}
