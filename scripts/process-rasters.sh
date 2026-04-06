#!/bin/bash
# Process LiDAR and CVSA rasters into COGs for TiTiler
# Run on the GCP VM with sudo
set -e

RASTER_DIR=/data/coolify/rasters/agrostatis

echo "============================================"
echo "  AGROSTATIS Raster Processing Pipeline"
echo "============================================"

# ─── 1. Process LiDAR → DEM → Slope → Aspect ────────────────────────────
echo ""
echo "=== 1. Processing LiDAR ==="

if [ -f /tmp/lidar.zip ]; then
  cd /tmp
  unzip -o lidar.zip -d lidar_raw 2>/dev/null
  cp lidar_raw/*.las $RASTER_DIR/raw/ 2>/dev/null || true

  # Use pdal/gdal container for LiDAR processing
  docker run --rm \
    -v $RASTER_DIR:/data \
    -v /tmp/lidar_raw:/input \
    pdal/pdal:latest bash -c '
    echo "  Creating DEM from ground points (classification 2)..."
    pdal pipeline /dev/stdin <<PIPE
    {
      "pipeline": [
        "/input/swisssurface3d.las",
        {
          "type": "filters.range",
          "limits": "Classification[2:2]"
        },
        {
          "type": "writers.gdal",
          "resolution": 1.0,
          "output_type": "idw",
          "filename": "/data/derived/dem_1m.tif"
        }
      ]
    }
PIPE
    echo "  DEM created: $(du -h /data/derived/dem_1m.tif | cut -f1)"

    # LAS info
    pdal info --summary /input/swisssurface3d.las 2>/dev/null | head -20
  '

  # Use GDAL for slope, aspect, COG conversion
  docker run --rm -v $RASTER_DIR:/data \
    ghcr.io/osgeo/gdal:ubuntu-small-latest bash -c '
    echo "  Generating slope..."
    gdaldem slope /data/derived/dem_1m.tif /data/derived/slope_1m.tif -s 1.0
    echo "  Generating aspect..."
    gdaldem aspect /data/derived/dem_1m.tif /data/derived/aspect_1m.tif

    echo "  Converting to COGs..."
    for f in dem_1m slope_1m aspect_1m; do
      gdal_translate /data/derived/${f}.tif /data/cog/${f}.cog.tif \
        -of COG -co COMPRESS=DEFLATE -co OVERVIEW_RESAMPLING=AVERAGE 2>/dev/null
      echo "    ${f}.cog.tif → $(du -h /data/cog/${f}.cog.tif | cut -f1)"
    done

    echo "  DEM info:"
    gdalinfo -stats /data/cog/dem_1m.cog.tif 2>/dev/null | grep -E "Size|Pixel|Min|Max"
  '
  echo "  LiDAR pipeline complete"
else
  echo "  No LiDAR file at /tmp/lidar.zip — skipping"
fi

# ─── 2. Process CVSA → merged COG ────────────────────────────────────────
echo ""
echo "=== 2. Processing CVSA raster tiles ==="

if [ -f /tmp/cvsa.zip ]; then
  cd /tmp
  unzip -o cvsa.zip -d cvsa_raw 2>/dev/null

  docker run --rm -v $RASTER_DIR:/data -v /tmp/cvsa_raw:/input \
    ghcr.io/osgeo/gdal:ubuntu-small-latest bash -c '
    TILES=$(find /input -name "*.tif" | sort)
    COUNT=$(echo "$TILES" | wc -l)
    echo "  Merging $COUNT CVSA tiles..."
    gdal_merge.py -o /data/derived/cvsa_merged.tif $TILES -co COMPRESS=DEFLATE 2>/dev/null

    echo "  Converting to COG..."
    gdal_translate /data/derived/cvsa_merged.tif /data/cog/cvsa_soil_vegetation.cog.tif \
      -of COG -co COMPRESS=DEFLATE -co OVERVIEW_RESAMPLING=NEAREST 2>/dev/null
    echo "    cvsa_soil_vegetation.cog.tif → $(du -h /data/cog/cvsa_soil_vegetation.cog.tif | cut -f1)"

    echo "  CVSA info:"
    gdalinfo -stats /data/cog/cvsa_soil_vegetation.cog.tif 2>/dev/null | grep -E "Size|Pixel|Min|Max"
  '
  echo "  CVSA pipeline complete"
else
  echo "  No CVSA file at /tmp/cvsa.zip — skipping"
fi

# ─── 3. Summary ──────────────────────────────────────────────────────────
echo ""
echo "=== COG files ready for TiTiler ==="
ls -lh $RASTER_DIR/cog/ 2>/dev/null || echo "  No COGs found"
echo ""
echo "============================================"
echo "  Processing complete"
echo "============================================"
