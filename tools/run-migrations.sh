#!/bin/bash

# Run database migrations via Docker
DB_CONTAINER="fact-check-postgres"
DB_USER="fact_check_user"
DB_NAME="fact_check"
MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../server/sql/migrations" && pwd)"

echo "🔄 Running database migrations..."
echo "================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "❌ Container '$DB_CONTAINER' is not running."
    echo "   Start it with: docker compose up -d postgres"
    exit 1
fi

echo "✅ Docker container '$DB_CONTAINER' is running"

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo "❌ Migrations directory not found: $MIGRATIONS_DIR"
    exit 1
fi

# Run each migration file in order
for migration_file in "$MIGRATIONS_DIR"/*.sql; do
    if [ -f "$migration_file" ]; then
        filename=$(basename "$migration_file")
        echo "📄 Running migration: $filename"
        
        # Run the migration
        docker exec -i $DB_CONTAINER psql -U $DB_USER -d $DB_NAME < "$migration_file"
        
        if [ $? -eq 0 ]; then
            echo "✅ Migration completed: $filename"
        else
            echo "❌ Migration failed: $filename"
            exit 1
        fi
    fi
done

echo ""
echo "✅ All migrations completed successfully!"
echo ""

# Show current tables
echo "📊 Current database tables:"
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "\dt"
