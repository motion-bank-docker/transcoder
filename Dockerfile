FROM motionbank/media-base-system:latest
MAINTAINER Motion Bank

# Setup app

WORKDIR /app
COPY . .
RUN rm -rf node_modules
RUN npm install --production
EXPOSE 4040
CMD ["node", "src"]
