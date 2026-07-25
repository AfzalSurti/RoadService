from sqlalchemy import Enum as SAEnum


def pg_enum(enum_cls, name: str):
    """Postgres ENUM that stores enum .value (e.g. 'admin'), not member name ('ADMIN')."""
    return SAEnum(
        enum_cls,
        name=name,
        values_callable=lambda members: [m.value for m in members],
        validate_strings=True,
    )
