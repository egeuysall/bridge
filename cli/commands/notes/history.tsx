import { argument } from 'pastel';
import zod from 'zod';
import { runNotesHistory } from '../../actions/resources';
import { RunCommand } from '../../core/pastel';
import { endpointOption, jsonColorOptions } from '../../core/schemas';
import type { NotesVersionOptions } from '../../core/shared';

export const description = 'List note versions';

export const args = zod.tuple([
  zod.string().describe(argument({ name: 'id', description: 'Note ID' })),
]);

export const options = zod.object({
  endpoint: endpointOption,
  ...jsonColorOptions,
});

type Props = { args: zod.infer<typeof args>; options: zod.infer<typeof options> };

export default function NotesHistory({ args: parsedArgs, options: parsedOptions }: Props) {
  return (
    <RunCommand
      label="Loading versions"
      json={parsedOptions.json}
      updateCheck={parsedOptions.updateCheck}
      action={(command) =>
        runNotesHistory(parsedArgs[0], parsedOptions as NotesVersionOptions, command)
      }
    />
  );
}
