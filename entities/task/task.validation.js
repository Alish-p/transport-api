import { z } from 'zod';
import { TASK_PRIORITIES, TASK_STATUSES } from './task.constants.js';

const taskSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    priority: z.enum(Object.values(TASK_PRIORITIES)).optional(),
    status: z.enum(Object.values(TASK_STATUSES)).optional(),
    departments: z.array(z.string()).optional(),
    assignees: z.array(z.string()).optional(),
    due: z.array(z.coerce.date()).optional(),
    description: z.string().optional(),
  }),
});

export { taskSchema };
