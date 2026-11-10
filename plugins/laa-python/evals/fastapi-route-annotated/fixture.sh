#!/bin/sh
# The orders service with an OrderOut schema and a get_session dependency, but no orders router
# yet. The only existing route (healthz) uses a return annotation and no dependencies, so the
# repo sets no pattern for response_model or Depends; the skill's defaults decide.
set -eu
sh "$(dirname "$0")/../_fixtures/fastapi-service.sh"

cat > src/app/orders/schemas.py <<'PY'
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    customer_email: str
    total: Decimal
    status: str
    created_at: datetime
PY
