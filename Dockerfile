FROM ubuntu:xenial
MAINTAINER Motion Bank

# Install NodeJS 9

RUN apt-get update && apt-get install -y curl build-essential
RUN curl -sL https://deb.nodesource.com/setup_9.x | bash -
RUN apt-get install -y nodejs
RUN npm i -g npm

# Install FFmpeg & Graphicsmagick

RUN apt-get update && apt-get install -y software-properties-common && add-apt-repository ppa:jonathonf/ffmpeg-4
RUN apt-get update && apt-get install -y ffmpeg graphicsmagick
RUN which ffmpeg && which ffprobe && which gm
RUN ffmpeg -version && ffprobe -version

# Cleanup

RUN apt-get remove -y software-properties-common curl && apt-get autoremove -y && apt-get clean

# Setup app

WORKDIR /app
COPY . .
RUN rm -rf node_modules
RUN npm install --production
EXPOSE 4040
