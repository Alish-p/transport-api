import { z } from 'zod';

const fetchSubtripEventsSchema = z.object({
  params: z.object({
    subtripId: z.string(),
  }),
});

export { fetchSubtripEventsSchema, };
