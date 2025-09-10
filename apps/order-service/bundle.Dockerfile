# apps/order-service/Dockerfile
FROM node:20-alpine

# Optional: tini for clean PID1
RUN apk add --no-cache tini

# You don’t need npm/corepack/docs/headers at runtime
RUN rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/include \
    /usr/local/share/man \
    /usr/local/share/doc

# If you’re feeling spicy: strip the binary (saves a few MB)
# RUN apk add --no-cache binutils && strip /usr/local/bin/node

# Run as non-root
RUN addgroup -g 10001 nodeapp && adduser -D -u 10001 -G nodeapp nodeapp
USER nodeapp
WORKDIR /app
ENV NODE_ENV=production
COPY apps/order-service/dist-bundle ./bundle/
EXPOSE 3001 3002
ENTRYPOINT ["tini","-g","--"]
CMD ["node", "--enable-source-maps", "bundle/main.js"]
