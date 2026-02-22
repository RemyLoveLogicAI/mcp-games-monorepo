#!/bin/bash
# PostgreSQL Replication Setup Script
# Configures primary-replica streaming replication

set -e

PRIMARY_HOST="${PRIMARY_HOST:-postgres-primary-0.postgres-primary}"
REPLICA_HOST="${REPLICA_HOST:-postgres-replica-0.postgres-replica}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
REPLICATION_USER="${REPLICATION_USER:-replication}"
REPLICATION_PASSWORD="${REPLICATION_PASSWORD:-replication_password}"

echo "=== PostgreSQL Replication Setup ==="

# 1. Create replication user on primary
echo "Creating replication user on primary..."
PGPASSWORD=secure_password_change_me psql -h "$PRIMARY_HOST" -U "$POSTGRES_USER" -d postgres << EOF
CREATE USER $REPLICATION_USER WITH REPLICATION ENCRYPTED PASSWORD '$REPLICATION_PASSWORD';
EOF

# 2. Take base backup from primary
echo "Taking base backup from primary..."
PGPASSWORD=$REPLICATION_PASSWORD pg_basebackup \
  -h "$PRIMARY_HOST" \
  -D /var/lib/postgresql/data/pgdata \
  -U "$REPLICATION_USER" \
  -v \
  -P \
  --wal-method=stream

# 3. Create recovery.conf on replica
echo "Creating recovery configuration..."
cat > /var/lib/postgresql/data/pgdata/recovery.conf << EOF
standby_mode = 'on'
primary_conninfo = 'host=$PRIMARY_HOST port=5432 user=$REPLICATION_USER password=$REPLICATION_PASSWORD'
recovery_target_timeline = 'latest'
trigger_file = '/tmp/promote_replica'
EOF

# 4. Set permissions
chmod 600 /var/lib/postgresql/data/pgdata/recovery.conf

echo "=== Replication Setup Complete ==="
echo "Primary: $PRIMARY_HOST"
echo "Replica: $REPLICA_HOST"
echo "Replication User: $REPLICATION_USER"
