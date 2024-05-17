FROM postgres:15.1-alpine

LABEL author="Chris Shatrov"
LABEL description="Postgres Image for challenge"
LABEL version="1.0"

COPY ./*.sql /docker-entrypoint-initdb.d/