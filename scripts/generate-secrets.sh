#!/bin/bash
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"
echo "SECRET_KEY=$(openssl rand -base64 64)"
