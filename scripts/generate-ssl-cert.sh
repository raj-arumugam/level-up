#!/bin/bash

# SSL Certificate Generation Script
# Usage: ./scripts/generate-ssl-cert.sh [domain]

set -e

DOMAIN=${1:-yourdomain.com}
SSL_DIR="./nginx/ssl"
DAYS=365

echo "Generating SSL certificate for domain: ${DOMAIN}"

# Create SSL directory if it doesn't exist
mkdir -p ${SSL_DIR}

# Generate private key
echo "Generating private key..."
openssl genrsa -out ${SSL_DIR}/private.key 4096

# Generate certificate signing request
echo "Generating certificate signing request..."
openssl req -new -key ${SSL_DIR}/private.key -out ${SSL_DIR}/cert.csr -subj "/C=US/ST=State/L=City/O=Organization/OU=OrgUnit/CN=${DOMAIN}"

# Generate self-signed certificate (for development/testing)
echo "Generating self-signed certificate..."
openssl x509 -req -days ${DAYS} -in ${SSL_DIR}/cert.csr -signkey ${SSL_DIR}/private.key -out ${SSL_DIR}/cert.pem

# Set proper permissions
chmod 600 ${SSL_DIR}/private.key
chmod 644 ${SSL_DIR}/cert.pem

echo "SSL certificate generated successfully!"
echo "Files created:"
echo "  - ${SSL_DIR}/private.key (private key)"
echo "  - ${SSL_DIR}/cert.pem (certificate)"
echo "  - ${SSL_DIR}/cert.csr (certificate signing request)"

echo ""
echo "For production, replace the self-signed certificate with a certificate from a trusted CA."
echo "You can use Let's Encrypt with certbot for free SSL certificates:"
echo "  certbot certonly --webroot -w /var/www/html -d ${DOMAIN}"

# Clean up CSR file
rm ${SSL_DIR}/cert.csr

echo "Certificate setup completed!"