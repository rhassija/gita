#!/bin/bash
# Helper script to run the book ingestion pipeline

# Ensure script directory is working directory
cd "$(dirname "$0")"

# Export flag required for Pydantic/PyO3 build compatibility on Python 3.13 on Mac
export PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1

# Run the ingestion script with any arguments passed to this script (e.g. --clear)
./venv/bin/python -m app.ingest "$@"
