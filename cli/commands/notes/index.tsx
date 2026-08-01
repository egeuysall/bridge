import { RunCommand } from '../../core/pastel';
import { renderPanel } from '../../core/ui';

export const description = 'Notes CRUD operations';

export default function Notes() {
  return (
    <RunCommand
      label="Loading notes"
      skipUpdateCheck
      action={async () =>
        renderPanel({
          title: 'bri notes',
          enableColor: process.stdout.isTTY,
          rows: [
            {
              label: 'commands',
              value: 'list, read, ask, update, delete, invite, history, version, restore-version',
              tone: 'info',
            },
            { label: 'help', value: 'bri notes --help', tone: 'muted' },
          ],
        })
      }
    />
  );
}
