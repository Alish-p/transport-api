Database Backup

Usage
- Ensure `.env` contains `MONGO_URI` pointing to your MongoDB.
- Run: `npm run backup:db`

Output
- Creates a folder under `backups/` named `<dbName>-backup-YYYYMMDD_HHMMSS`.
- Dumps each collection to a `<collection>.json` file (JSON array).
- Includes `backup-meta.json` with basic context.

Notes
- This script uses a simple JSON export via the MongoDB Node driver.
- For very large datasets, consider installing MongoDB Database Tools and using `mongodump` for faster, more compact backups.
