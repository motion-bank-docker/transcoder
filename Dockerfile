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

# Install LTC tools

RUN apt-get update && apt-get install -y git pkg-config libjack-dev libsndfile-dev libltc11 libltc-dev
RUN git clone https://github.com/x42/ltc-tools.git
RUN cd ltc-tools && make all && make install && cd .. && rm -r ltc-tools

# Cleanup

RUN apt-get remove -y software-properties-common curl git pkg-config && apt-get autoremove -y && apt-get clean

# Setup app

WORKDIR /app
COPY . .
RUN rm -rf node_modules
RUN npm install --production
EXPOSE 4040
CMD ["node", "src"]
