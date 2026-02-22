#!/bin/bash
# PostgreSQL Automatic Failover Script
# Promotes replica to primary if primary is unavailable

set -e

PRIMARY_HOST="${PRIMARY_HOST:-postgres-primary-0.postgres-primary}"
REPLICA_HOST="${REPLICA_HOST:-postgres-replica-0.postgres-replica}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-secure_password_change_me}"

echo "=== PostgreSQL Failover Script ==="

# 1. Check if primary is accessible
echo "Checking primary availability..."
if ! PGPASSWORD="$POSTGRES_PASSWORD" pg_isready -h "$PRIMARY_HOST" -U "$POSTGRES_USER" -t 5 > /dev/null 2>&1; then
  echo "Primary is DOWN. Initiating failover..."
else
  echo "Primary is UP. Failover not needed."
  exit 0
fi

# 2. Promote replica to primary
echo "Promoting replica to primary..."
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$REPLICA_HOST" -U "$POSTGRES_USER" -d postgres << EOF
SELECT pg_promote();
EOF

# 3. Wait for replica to become primary
echo "Waiting for replica to become primary..."
sleep 10

# 4. Verify new primary
echo "Verifying new primary..."
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$REPLICA_HOST" -U "$POSTGRES_USER" -d postgres << EOF
SELECT version();
SELECT pg_is_in_recovery();
EOF

# 5. Update application connection strings
echo "Failover complete!"
echo "New Primary: $REPLICA_HOST"
echo "Update your applications to use: $REPLICA_HOST"

# Optional: Create trigger file for replica to promote
# touch /tmp/promote_replica
