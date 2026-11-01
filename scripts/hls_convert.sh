#!/bin/bash
# Carpeta de datos: ARCHIVO_DATOS si está definida; si no, ~/domains/app.mpi-sala.es/archivo-datos
# (disposición nueva) y, si no existe, la carpeta de la web (disposición antigua).
APP=~/domains/app.mpi-sala.es
RAIZ=${ARCHIVO_DATOS:-$APP/archivo-datos}
[ -d "$RAIZ/caseros" ] || RAIZ=$APP/public_html/videos
cd "$RAIZ" || exit 1
mkdir -p hls
files=("$@"); [ ${#files[@]} -eq 0 ] && files=(caseros/*.mp4)
for f in "${files[@]}"; do
  n=$(basename "$f" .mp4)
  [ -f "hls/$n/index.m3u8" ] && { echo "SALTO $n"; continue; }
  rm -rf "hls/$n.tmp"; mkdir -p "hls/$n.tmp"
  echo "$(date +%T) INICIO $n"
  if nice -n 19 ~/bin/ffmpeg -hide_banner -loglevel error -i "$f" \
    -vf scale=-2:576 -c:v libx264 -preset veryfast -crf 25 -profile:v main -pix_fmt yuv420p \
    -threads 2 -g 50 -keyint_min 50 -sc_threshold 0 -c:a aac -b:a 128k \
    -f hls -hls_time 6 -hls_playlist_type vod \
    -hls_segment_filename "hls/$n.tmp/seg_%04d.ts" "hls/$n.tmp/index.m3u8"; then
    mv "hls/$n.tmp" "hls/$n"; echo "$(date +%T) OK $n $(du -sh hls/$n | cut -f1)"
  else
    echo "$(date +%T) ERROR $n"; rm -rf "hls/$n.tmp"
  fi
done
