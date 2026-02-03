
import Task from './task.model.js';

export async function autoArchiveTasks() {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 48);

    try {
        const tasksToArchive = await Task.find({
            status: 'done',
            updatedAt: { $lt: cutoffDate },
        });

        if (tasksToArchive.length === 0) {
            return;
        }

        const result = await Task.updateMany(
            {
                status: 'done',
                updatedAt: { $lt: cutoffDate },
            },
            {
                $set: { status: 'archive' },
                $push: {
                    activities: {
                        action: 'auto_archived',
                        message: 'Auto-archived after 48 hours in Done',
                        timestamp: new Date(),
                    },
                },
            }
        );

        // eslint-disable-next-line no-console
        console.log(
            `[Cron] Auto-archived ${result.modifiedCount} tasks older than ${cutoffDate.toISOString()}`
        );
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[Cron] Error auto-archiving tasks:', error);
    }
}
