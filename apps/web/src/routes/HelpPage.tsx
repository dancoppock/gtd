import { AppHeader } from "../features/layout/AppHeader";
import { useBoardTheme } from "../features/theme/useBoardTheme";

type ShortcutGroup = {
  title: string;
  shortcuts: Array<{
    keys: string;
    description: string;
  }>;
};

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Navigate",
    shortcuts: [
      {
        keys: "Arrow keys or h/j/k/l",
        description: "Select tickets. If nothing is selected, the first matching ticket is selected.",
      },
      {
        keys: "Left / Right or h / l",
        description: "Jump to the nearest available ticket in another column, wrapping across columns when needed.",
      },
      {
        keys: "Up / Down or k / j",
        description: "Move through the visible stack in the current column, wrapping from end to start.",
      },
      {
        keys: "0 / $",
        description: "Move the selected ticket title cursor to the first or last character.",
      },
      {
        keys: "w/W / b/B",
        description: "Move the selected ticket title cursor to the next or previous word.",
      },
    ],
  },
  {
    title: "Select and Tag",
    shortcuts: [
      {
        keys: "Space",
        description: "Toggle tag state on the selected ticket.",
      },
      {
        keys: "Shift + click",
        description: "Toggle tag state on any ticket.",
      },
      {
        keys: "Shift + Up / Down or Shift + k / j",
        description: "Expand or contract the tagged range above or below, then move the highlight.",
      },
      {
        keys: "Shift + T",
        description: "Clear all tagged tickets.",
      },
    ],
  },
  {
    title: "Move and Prioritise",
    shortcuts: [
      {
        keys: "Cmd + Arrow or Cmd + h/j/k/l",
        description: "Move tagged tickets as a group, or the selected ticket when nothing is tagged. In swimlane view, Up/Down can move tickets between swimlanes.",
      },
      {
        keys: "Option + Arrow or Option + h/j/k/l",
        description: "Alternative shortcut for the same quick move behavior, including between swimlanes.",
      },
      {
        keys: "1 / 2 / 3 / 4",
        description: "Set priority to Highest, High, Medium, or Low. Tagged tickets take priority over the selected ticket.",
      },
    ],
  },
  {
    title: "Create and Edit",
    shortcuts: [
      {
        keys: "N or O",
        description: "Create a ticket below the selected ticket and start inline title editing.",
      },
      {
        keys: "Shift + N or Shift + O",
        description: "Create a ticket above the selected ticket and start inline title editing.",
      },
      {
        keys: "Enter",
        description: "Edit the selected ticket title inline at the end of the title.",
      },
      {
        keys: "i",
        description: "Edit the selected ticket title inline at the current title cursor.",
      },
      {
        keys: "a",
        description: "Edit the selected ticket title inline after the current title cursor.",
      },
      {
        keys: "Shift + Enter / Cmd + Enter",
        description: "Open the selected ticket in the edit modal.",
      },
      {
        keys: "Cmd + Enter in a modal",
        description: "Save and close the create or edit modal from any form field.",
      },
      {
        keys: "Escape",
        description: "Close the edit modal when the title field has focus.",
      },
    ],
  },
  {
    title: "Views",
    shortcuts: [
      {
        keys: "T",
        description: "Toggle expanded/collapsed state for the selected ticket.",
      },
      {
        keys: "Shift + C",
        description: "Toggle the board between compact and expanded ticket layout.",
      },
      {
        keys: "Shift + H",
        description: "Toggle the header panel visibility.",
      },
    ],
  },
];

const featureSections = [
  {
    title: "Boards and Tickets",
    items: [
      "Boards are configurable views over the shared ticket pool.",
      "Filters can narrow a board by priority, labels, and search text.",
      "The built-in system board groups all active tickets and completed tickets into its special Active and Done columns.",
      "Hashtags in ticket titles become labels when a ticket is saved from the modal.",
    ],
  },
  {
    title: "Dragging",
    items: [
      "Drag tickets within a column to reorder the visible list.",
      "Drag tickets across columns to change their status and position.",
      "When a board is filtered, reordering is based on the visible subset.",
    ],
  },
  {
    title: "Swimlanes",
    items: [
      "Swimlane view groups visible tickets by label while preserving the board columns.",
      "Drag tickets within a swimlane to reorder or move them across columns.",
      "Drag a ticket to another swimlane to update the label that determines its lane.",
      "Use the swimlane arrow controls to persist a custom lane order.",
    ],
  },
  {
    title: "Ticket Cards",
    items: [
      "Single click a compact ticket card to select it; click it again to expand or collapse its details.",
      "Double click a ticket title to edit the title inline.",
      "Use the edit button on the ticket rail to open the full edit modal.",
    ],
  },
];

export function HelpPage() {
  const { theme, setTheme } = useBoardTheme();

  return (
    <main className="page-shell">
      <AppHeader
        activeNav="help"
        description="Keyboard shortcuts and working notes for the board interface."
        theme={theme}
        title="Help"
        onThemeChange={setTheme}
      />

      <section className="help-layout">
        <article className="labels-panel help-panel">
          <div className="labels-panel__header">
            <div>
              <h2>Keyboard Shortcuts</h2>
              <p>Board shortcuts apply when a modal or text field is not focused. Modal shortcuts apply inside ticket forms.</p>
            </div>
          </div>

          <div className="help-shortcut-groups">
            {shortcutGroups.map((group) => (
              <section key={group.title} className="help-section">
                <h3>{group.title}</h3>
                <dl className="shortcut-list">
                  {group.shortcuts.map((shortcut) => (
                    <div key={`${group.title}-${shortcut.keys}`} className="shortcut-row">
                      <dt>
                        <kbd>{shortcut.keys}</kbd>
                      </dt>
                      <dd>{shortcut.description}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </article>

        <article className="labels-panel help-panel">
          <div className="labels-panel__header">
            <div>
              <h2>Main Features</h2>
              <p>The core behaviours worth remembering while working a board.</p>
            </div>
          </div>

          <div className="help-feature-grid">
            {featureSections.map((section) => (
              <section key={section.title} className="help-section">
                <h3>{section.title}</h3>
                <ul className="help-list">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
