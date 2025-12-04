import _ from 'lodash';
import Activity from '../../entities/activity/activity.model.js';

const activityLoggerPlugin = (schema, options = {}) => {
    // Store original document state on load to compare later
    schema.post('init', function (doc) {
        doc._original = doc.toObject({ depopulate: true, transform: false });
    });

    schema.pre('save', function (next) {
        this._wasNew = this.isNew;
        if (!this.isNew) {
            this._modifiedPaths = this.modifiedPaths();
        }
        next();
    });

    schema.post('save', async function (doc) {
        try {
            // We expect the controller to attach `_user` to the document before saving
            // e.g. doc._user = req.user;
            const user = doc._user;

            // If explicit skip is requested
            if (doc._skipActivityLog) return;

            const action = doc._wasNew ? 'CREATE' : 'UPDATE';
            const entityType = options.entityType || doc.constructor.modelName;

            let changes = [];

            if (action === 'UPDATE' && doc._original) {
                const modifiedPaths = doc._modifiedPaths || [];

                modifiedPaths.forEach(path => {
                    // Ignore standard metadata fields
                    if (['updatedAt', 'createdAt', '__v'].includes(path)) return;

                    const oldValue = _.get(doc._original, path);
                    const newValue = _.get(doc, path);

                    // Use loose equality for ObjectIds (string vs object) or strict for others
                    // Lodash isEqual handles deep comparison well
                    // We might want to format ObjectIds to strings for comparison to avoid false positives
                    const cleanOld = JSON.parse(JSON.stringify(oldValue ?? null));
                    const cleanNew = JSON.parse(JSON.stringify(newValue ?? null));

                    if (!_.isEqual(cleanOld, cleanNew)) {
                        changes.push({
                            field: path,
                            oldValue,
                            newValue
                        });
                    }
                });
            }

            // If update but no changes detected (e.g. only timestamp changed), skip
            if (action === 'UPDATE' && changes.length === 0) return;

            const activity = new Activity({
                entity: doc._id,
                entityType,
                action,
                changes,
                performedBy: user ? {
                    _id: user._id,
                    name: user.name || user.firstName, // Adjust based on User model
                    email: user.email
                } : undefined,
                tenant: doc.tenant, // Assumes schema has tenant
                timestamp: new Date()
            });

            // Use the same session as the document if available
            await activity.save({ session: doc.$session() });

        } catch (err) {
            console.error('Activity logging failed:', err);
        }
    });
};

export default activityLoggerPlugin;
