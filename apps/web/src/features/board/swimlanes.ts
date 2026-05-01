import type { Column, RepositionTicketInput, Ticket } from "@gtd/contracts";

export const UNLABELED_SWIMLANE_KEY = "__unlabeled__";

export type Swimlane = {
  key: string;
  name: string;
  tickets: Ticket[];
};

export function resolveTicketSwimlane(
  ticket: Ticket,
  implicitLabelNames: ReadonlySet<string>,
): Pick<Swimlane, "key" | "name"> {
  const swimlaneLabel = ticket.labels.find(
    (label) => !implicitLabelNames.has(label.normalizedName),
  );

  if (!swimlaneLabel) {
    return {
      key: UNLABELED_SWIMLANE_KEY,
      name: "Unlabeled",
    };
  }

  return {
    key: swimlaneLabel.normalizedName,
    name: swimlaneLabel.name,
  };
}

export function buildSwimlanes(
  columns: Column[],
  tickets: Ticket[],
  implicitLabelNames: ReadonlySet<string>,
): Swimlane[] {
  const lanes = new Map<string, Swimlane>();
  const completedStatusKeys = new Set(
    columns
      .filter((column) => column.statusCategory === "completed")
      .map((column) => column.statusKey),
  );

  tickets.forEach((ticket) => {
    const { key, name } = resolveTicketSwimlane(ticket, implicitLabelNames);
    const lane = lanes.get(key);

    if (lane) {
      lane.tickets.push(ticket);
      return;
    }

    lanes.set(key, {
      key,
      name,
      tickets: [ticket],
    });
  });

  return Array.from(lanes.values()).filter((lane) =>
    lane.tickets.some((ticket) => !completedStatusKeys.has(ticket.statusKey)),
  );
}

export function buildSwimlaneRepositionInput(
  columns: Column[],
  tickets: Ticket[],
  ticketId: string,
  implicitLabelNames: ReadonlySet<string>,
): RepositionTicketInput | null {
  const ticket = tickets.find((candidate) => candidate.id === ticketId);
  if (!ticket) {
    return null;
  }

  const swimlaneKey = resolveTicketSwimlane(ticket, implicitLabelNames).key;
  const laneTickets = tickets.filter(
    (candidate) => resolveTicketSwimlane(candidate, implicitLabelNames).key === swimlaneKey,
  );

  const columnTickets = columns.flatMap((column) =>
    column.statusKey === ticket.statusKey
      ? laneTickets.filter((candidate) => candidate.statusKey === column.statusKey)
      : [],
  );

  const ticketIndex = columnTickets.findIndex((candidate) => candidate.id === ticketId);
  if (ticketIndex < 0) {
    return null;
  }

  return {
    statusKey: ticket.statusKey,
    prevVisibleTicketId: columnTickets[ticketIndex - 1]?.id ?? null,
    nextVisibleTicketId: columnTickets[ticketIndex + 1]?.id ?? null,
  };
}
