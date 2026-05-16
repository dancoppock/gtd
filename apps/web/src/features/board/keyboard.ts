import type { Column, Ticket } from "@gtd/contracts";

export type BoardTicketLane = {
  key: string;
  tickets: Ticket[];
};

export type TicketNavigationDirection = "up" | "down" | "left" | "right";

export type TicketMoveDirection = TicketNavigationDirection;

type TicketCell = {
  columnIndex: number;
  laneIndex: number;
  ticket: Ticket;
  ticketIndex: number;
};

function ticketMatchesColumn(ticket: Ticket, column: Column) {
  return ticket.statusKey === column.statusKey;
}

function buildColumnRows(columns: Column[], lanes: BoardTicketLane[]) {
  return lanes.map((lane) =>
    columns.map((column) => lane.tickets.filter((ticket) => ticketMatchesColumn(ticket, column))),
  );
}

function findCell(rows: Ticket[][][], ticketId: string | null) {
  if (!ticketId) {
    return null;
  }

  for (let laneIndex = 0; laneIndex < rows.length; laneIndex += 1) {
    for (let columnIndex = 0; columnIndex < rows[laneIndex]!.length; columnIndex += 1) {
      const ticketIndex = rows[laneIndex]![columnIndex]!.findIndex((ticket) => ticket.id === ticketId);

      if (ticketIndex >= 0) {
        return {
          columnIndex,
          laneIndex,
          ticket: rows[laneIndex]![columnIndex]![ticketIndex]!,
          ticketIndex,
        };
      }
    }
  }

  return null;
}

function firstTicketInColumn(rows: Ticket[][][], columnIndex: number) {
  for (const lane of rows) {
    const ticket = lane[columnIndex]?.[0];

    if (ticket) {
      return ticket;
    }
  }

  return null;
}

function lastTicketInColumn(rows: Ticket[][][], columnIndex: number) {
  for (let laneIndex = rows.length - 1; laneIndex >= 0; laneIndex -= 1) {
    const tickets = rows[laneIndex]?.[columnIndex] ?? [];
    const ticket = tickets[tickets.length - 1];

    if (ticket) {
      return ticket;
    }
  }

  return null;
}

function nearestTicketInColumn(rows: Ticket[][][], cell: TicketCell, columnIndex: number) {
  const sameLaneTickets = rows[cell.laneIndex]?.[columnIndex] ?? [];
  const sameLaneTicket = sameLaneTickets[Math.min(cell.ticketIndex, sameLaneTickets.length - 1)];

  if (sameLaneTicket) {
    return sameLaneTicket;
  }

  for (let distance = 1; distance < rows.length; distance += 1) {
    const previousLaneTicket = rows[cell.laneIndex - distance]?.[columnIndex]?.[0];
    if (previousLaneTicket) {
      return previousLaneTicket;
    }

    const nextLaneTicket = rows[cell.laneIndex + distance]?.[columnIndex]?.[0];
    if (nextLaneTicket) {
      return nextLaneTicket;
    }
  }

  return null;
}

function getColumnTickets(rows: Ticket[][][], columnIndex: number) {
  return rows.flatMap((lane) => lane[columnIndex] ?? []);
}

function getWrappedColumnIndexes(columnCount: number, currentColumnIndex: number, step: -1 | 1) {
  return Array.from({ length: Math.max(columnCount - 1, 0) }, (_, offset) => {
    const distance = offset + 1;
    return (currentColumnIndex + distance * step + columnCount) % columnCount;
  });
}

function defaultTicket(rows: Ticket[][][], direction: TicketNavigationDirection) {
  if (rows.length === 0 || rows[0]!.length === 0) {
    return null;
  }

  if (direction === "left") {
    for (let columnIndex = rows[0]!.length - 1; columnIndex >= 0; columnIndex -= 1) {
      const ticket = firstTicketInColumn(rows, columnIndex);
      if (ticket) {
        return ticket.id;
      }
    }
  }

  const columnRange =
    direction === "right"
      ? Array.from({ length: rows[0]!.length }, (_, index) => index)
      : Array.from({ length: rows[0]!.length }, (_, index) => index);

  for (const columnIndex of columnRange) {
    const ticket =
      direction === "up" ? lastTicketInColumn(rows, columnIndex) : firstTicketInColumn(rows, columnIndex);

    if (ticket) {
      return ticket.id;
    }
  }

  return null;
}

export function getNextTicketId(
  columns: Column[],
  lanes: BoardTicketLane[],
  selectedTicketId: string | null,
  direction: TicketNavigationDirection,
) {
  const rows = buildColumnRows(columns, lanes);
  const cell = findCell(rows, selectedTicketId);

  if (!cell) {
    return defaultTicket(rows, direction);
  }

  if (direction === "up") {
    const columnTickets = getColumnTickets(rows, cell.columnIndex);
    const currentIndex = columnTickets.findIndex((ticket) => ticket.id === selectedTicketId);

    if (currentIndex < 0 || columnTickets.length === 0) {
      return selectedTicketId;
    }

    return columnTickets[(currentIndex - 1 + columnTickets.length) % columnTickets.length]?.id ?? selectedTicketId;
  }

  if (direction === "down") {
    const columnTickets = getColumnTickets(rows, cell.columnIndex);
    const currentIndex = columnTickets.findIndex((ticket) => ticket.id === selectedTicketId);

    if (currentIndex < 0 || columnTickets.length === 0) {
      return selectedTicketId;
    }

    return columnTickets[(currentIndex + 1) % columnTickets.length]?.id ?? selectedTicketId;
  }

  const columnIndexes = getWrappedColumnIndexes(columns.length, cell.columnIndex, direction === "left" ? -1 : 1);

  for (const nextColumnIndex of columnIndexes) {
    const sameLaneTickets = rows[cell.laneIndex]?.[nextColumnIndex] ?? [];
    const sameLaneTicket = sameLaneTickets[Math.min(cell.ticketIndex, sameLaneTickets.length - 1)];

    if (sameLaneTicket) {
      return sameLaneTicket.id;
    }
  }

  for (const nextColumnIndex of columnIndexes) {
    const nearestTicket = nearestTicketInColumn(rows, cell, nextColumnIndex);

    if (nearestTicket) {
      return nearestTicket.id;
    }
  }

  return selectedTicketId;
}

export function getTicketMoveTarget(
  columns: Column[],
  lanes: BoardTicketLane[],
  selectedTicketId: string,
  direction: TicketMoveDirection,
) {
  const rows = buildColumnRows(columns, lanes);
  const cell = findCell(rows, selectedTicketId);

  if (!cell) {
    return null;
  }

  if (direction === "up") {
    return rows[cell.laneIndex]?.[cell.columnIndex]?.[cell.ticketIndex - 1]?.id ?? null;
  }

  if (direction === "down") {
    return rows[cell.laneIndex]?.[cell.columnIndex]?.[cell.ticketIndex + 1]?.id ?? columns[cell.columnIndex]?.id ?? null;
  }

  const nextColumnIndex = cell.columnIndex + (direction === "left" ? -1 : 1);

  if (nextColumnIndex < 0 || nextColumnIndex >= columns.length) {
    return null;
  }

  const targetTickets = rows[cell.laneIndex]?.[nextColumnIndex] ?? [];
  return targetTickets[Math.min(cell.ticketIndex, targetTickets.length - 1)]?.id ?? columns[nextColumnIndex]?.id ?? null;
}
