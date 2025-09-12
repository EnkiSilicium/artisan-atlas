FROM node:20-alpine AS swagger-assets
WORKDIR /deps
RUN npm -s init -y && npm i -s swagger-ui-dist@5

# --- stage: runtime (tiny, bundled app) ---
FROM node:20-alpine

# Optional: PID1
RUN apk add --no-cache tini

# Trim runtime junk
RUN rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/include \
    /usr/local/share/man \
    /usr/local/share/doc

# Non-root
RUN addgroup -g 10001 nodeapp && adduser -D -u 10001 -G nodeapp nodeapp
WORKDIR /app
ENV NODE_ENV=production

# Copy ONLY swagger UI assets into /app/public/swagger
COPY --from=swagger-assets --chown=nodeapp:nodeapp \
  /deps/node_modules/swagger-ui-dist/ /app/public/swagger/

# Keep your existing “external bundle” copy EXACTLY as you wrote it
USER nodeapp
COPY --chown=nodeapp:nodeapp apps/bonus-service/dist-bundle ./bundle/

EXPOSE 3001 3002
ENTRYPOINT ["tini","-g","--"]
CMD ["node", "--enable-source-maps", "bundle/main.js"]







