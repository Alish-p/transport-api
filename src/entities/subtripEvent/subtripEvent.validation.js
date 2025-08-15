import { z } from 'zod';

export const fetchSubtripEventsSchema = z.object({
  subtripId: z.string(),
});

export const validateFetchSubtripEvents = (data) => fetchSubtripEventsSchema.parse(data);

