import { argument } from 'pastel';
import zod from 'zod';
import { runNotesRestoreVersion } from '../../actions/resources';
import { RunCommand } from '../../core/pastel';
import { endpointOption, jsonColorOptions } from '../../core/schemas';
import type { NotesRestoreVersionOptions } from '../../core/shared';

export const description = 'Restore a note version';

export const args = zod.tuple([
  zod.string().describe(argument({ name: 'note-id', description: 'Note ID' })),
  zod.string().describe(argument({ name: 'version-id', description: 'Version ID' })),
]);

export const options = zod.object({
  endpoint: endpointOption,
  ...jsonColorOptions,
});

type Props = { args: zod.infer<typeof args>; options: zod.infer<typeof options> };

export default function NotesRestoreVersion({ args: parsedArgs, options: parsedOptions }: Props) {
  return (
    <RunCommand
      label="Restoring version"
      json={parsedOptions.json}
      updateCheck={parsedOptions.updateCheck}
      action={(command) =>
        runNotesRestoreVersion(
          parsedArgs[0],
          parsedArgs[1],
          parsedOptions as NotesRestoreVersionOptions,
          command
        )
      }
    />
  );
}
