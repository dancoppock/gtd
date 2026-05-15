import type { Column, RepositionTicketInput, Ticket } from "@gtd/contracts";

export const UNLABELED_SWIMLANE_KEY = "__unlabeled__";

export type Swimlane = {
  key: string;
  name: string;
  tickets: Ticket[];
};

export function resolveTicketSwimlane(
  ticket: Ticket,
  boardFilterLabelNames: ReadonlySet<string>,
): Pick<Swimlane, "key" | "name"> {
  const swimlaneLabel = ticket.labels.find(
    (label) => !boardFilterLabelNames.has(label.normalizedName),
  ) ?? ticket.labels[0];

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
  boardFilterLabelNames: ReadonlySet<string>,
  labelPriorityNames: readonly string[] = [],
): Swimlane[] {
  const lanes = new Map<string, Swimlane>();
  const labelPriorities = new Map(labelPriorityNames.map((labelName, index) => [labelName, index]));
  const completedStatusKeys = new Set(
    columns
      .filter((column) => column.statusCategory === "completed")
      .map((column) => column.statusKey),
  );

  tickets.forEach((ticket) => {
    const { key, name } = resolveTicketSwimlane(ticket, boardFilterLabelNames);
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

  return Array.from(lanes.values())
    .filter((lane) => lane.tickets.some((ticket) => !completedStatusKeys.has(ticket.statusKey)))
    .sort((left, right) => {
      if (left.key === UNLABELED_SWIMLANE_KEY) {
        return 1;
      }

      if (right.key === UNLABELED_SWIMLANE_KEY) {
        return -1;
      }

      const leftPriority = labelPriorities.get(left.key);
      const rightPriority = labelPriorities.get(right.key);

      if (leftPriority !== undefined && rightPriority !== undefined) {
        return leftPriority - rightPriority;
      }

      if (leftPriority !== undefined) {
        return -1;
      }

      if (rightPriority !== undefined) {
        return 1;
      }

      return left.name.localeCompare(right.name);
    });
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

export function updateTicketSwimlaneLabels(
  ticket: Ticket,
  targetSwimlane: Pick<Swimlane, "key" | "name">,
  boardFilterLabelNames: ReadonlySet<string>,
  boardDefaultLabelName?: string | null,
) {
  const sourceSwimlaneKey = resolveTicketSwimlane(ticket, boardFilterLabelNames).key;
  const shouldEnsureDefaultLabel =
    Boolean(boardDefaultLabelName)
    && boardFilterLabelNames.has(sourceSwimlaneKey)
    && targetSwimlane.key !== UNLABELED_SWIMLANE_KEY
    && !boardFilterLabelNames.has(targetSwimlane.key);
  const shouldRemoveDefaultLabel =
    Boolean(boardDefaultLabelName)
    && !boardFilterLabelNames.has(sourceSwimlaneKey)
    && boardFilterLabelNames.has(targetSwimlane.key);
  const labelsWithoutSourceSwimlane = ticket.labels.filter(
    (label) =>
      label.normalizedName !== sourceSwimlaneKey
      && (!shouldRemoveDefaultLabel || label.normalizedName !== boardDefaultLabelName),
  );

  if (targetSwimlane.key === UNLABELED_SWIMLANE_KEY) {
    return labelsWithoutSourceSwimlane;
  }

  const nextLabels = labelsWithoutSourceSwimlane.some((label) => label.normalizedName === targetSwimlane.key)
    ? labelsWithoutSourceSwimlane
    : [
        ...labelsWithoutSourceSwimlane,
        {
          id: `swimlane-label-${targetSwimlane.key}`,
          name: targetSwimlane.name,
          normalizedName: targetSwimlane.key,
        },
      ];

  if (
    shouldEnsureDefaultLabel
    && boardDefaultLabelName
    && !nextLabels.some((label) => label.normalizedName === boardDefaultLabelName)
  ) {
    return [
      ...nextLabels,
      {
        id: `swimlane-label-${boardDefaultLabelName}`,
        name: boardDefaultLabelName,
        normalizedName: boardDefaultLabelName,
      },
    ];
  }

  return nextLabels;
}
