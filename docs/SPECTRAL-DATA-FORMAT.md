# Spectral Data Format Guide

This guide explains how to format CSV/TSV spectral data files for use with mirador-xyviewer.

## Table of Contents

- [Overview](#overview)
- [Basic Format](#basic-format)
- [Column Recognition](#column-recognition)
- [Multi-Series Data](#multi-series-data)
- [Delimiter Detection](#delimiter-detection)
- [Performance Considerations](#performance-considerations)
- [Examples by Technique](#examples-by-technique)

## Overview

Mirador-xyviewer parses spectral data from CSV/TSV files and displays them as interactive Plotly charts. The parser:

- Auto-detects delimiters (comma, tab, semicolon, space)
- Recognizes common X-axis column names
- Supports multiple Y-axis series
- Handles headers with metadata rows
- Downsamples large datasets for performance

## Basic Format

### Minimal Format

Two columns: X values and Y values.

```csv
wavelength,intensity
400,0.12
410,0.15
420,0.23
430,0.45
```

### With Header Row

```csv
energy,counts
1.0,1523
1.5,2341
2.0,4521
2.5,3892
```

## Column Recognition

### X-Axis Column Names

The parser recognizes these column names as X-axis (case-insensitive):

| Name | Typical Use |
|------|-------------|
| `x` | Generic |
| `wavelength` | UV-Vis, Raman |
| `wavenumber` | FTIR, Raman |
| `energy` | XRF, XPS |
| `frequency` | Various |
| `channel` | XRF detectors |
| `position` | Spatial scans |
| `time` | Time-series |
| `index` | Generic |
| `nm` | Wavelength in nanometers |
| `ev` | Energy in electron-volts |
| `kev` | Energy in kilo-electron-volts |

### Y-Axis Columns

All columns not recognized as X-axis are treated as Y-series:

- `intensity`
- `counts`
- `absorbance`
- `transmittance`
- `reflectance`
- Any other column name

## Multi-Series Data

### Multiple Y Columns

```csv
wavelength,sample_1,sample_2,reference
400,0.12,0.15,0.10
410,0.18,0.22,0.12
420,0.25,0.31,0.15
```

This creates three series on the same plot:
- `sample_1` (blue)
- `sample_2` (orange)
- `reference` (green)

### XRF with Multiple Elements

```csv
energy_kev,Fe_Ka,Cu_Ka,Pb_La
1.0,120,45,23
2.0,340,89,56
3.0,890,234,123
```

## Delimiter Detection

The parser auto-detects these delimiters (in order of priority):

| Delimiter | File Extension | MIME Type |
|-----------|---------------|-----------|
| Tab | `.tsv` | `text/tab-separated-values` |
| Comma | `.csv` | `text/csv` |
| Semicolon | `.csv` | `text/csv` (European) |
| Space | `.txt` | `text/plain` |

### Examples

**Comma-separated:**
```
wavelength,intensity
400,0.12
410,0.15
```

**Tab-separated:**
```
wavelength	intensity
400	0.12
410	0.15
```

**Semicolon-separated (European format):**
```
wavelength;intensity
400;0,12
410;0,15
```

**Space-separated:**
```
wavelength intensity
400 0.12
410 0.15
```

## Performance Considerations

### File Size Limit

Maximum file size: **5 MB**

Files larger than 5 MB will be rejected with an error.

### Data Point Limit

Maximum data points: **10,000**

Datasets with more than 10,000 points are automatically downsampled using the **LTTB algorithm** (Largest Triangle Three Buckets), which preserves the visual shape of the data.

### Recommendations

| Data Points | Recommendation |
|-------------|----------------|
| < 1,000 | No optimization needed |
| 1,000 - 10,000 | Works well |
| 10,000 - 100,000 | Auto-downsampled |
| > 100,000 | Consider pre-processing |

### Pre-processing Large Files

For very large datasets, consider:

1. **Binning**: Average adjacent points
2. **Decimation**: Keep every Nth point
3. **Region extraction**: Export only relevant spectral range

## Examples by Technique

### XRF (X-Ray Fluorescence)

```csv
energy_kev,counts
0.5,234
1.0,456
1.5,789
2.0,1234
2.5,2345
3.0,3456
```

**Axis labels:**
- X: Energy (keV)
- Y: Counts

### Raman Spectroscopy

```csv
wavenumber,intensity
200,0.05
400,0.12
600,0.08
800,0.45
1000,0.23
```

**Axis labels:**
- X: Wavenumber (cm⁻¹)
- Y: Intensity (a.u.)

### FTIR (Fourier Transform Infrared)

```csv
wavenumber,absorbance,transmittance
4000,0.02,95.5
3500,0.05,89.1
3000,0.12,75.8
2500,0.08,83.2
2000,0.15,70.8
```

**Axis labels:**
- X: Wavenumber (cm⁻¹)
- Y: Absorbance / Transmittance (%)

### UV-Vis Spectroscopy

```csv
wavelength_nm,absorbance
200,2.5
250,1.8
300,0.9
350,0.4
400,0.2
```

**Axis labels:**
- X: Wavelength (nm)
- Y: Absorbance

### Reflectance Spectroscopy

```csv
wavelength,reflectance_percent
400,15.2
450,18.5
500,45.3
550,52.1
600,48.7
650,35.2
```

**Axis labels:**
- X: Wavelength (nm)
- Y: Reflectance (%)

### Time-Series (e.g., decay curves)

```csv
time_ms,signal
0,1000
10,850
20,720
30,615
40,520
50,445
```

**Axis labels:**
- X: Time (ms)
- Y: Signal (counts)

## Complete File Example

Here's a complete, well-formatted XRF spectrum file:

```csv
# XRF Spectrum - Sample: Blue pigment from painting
# Date: 2024-01-15
# Operator: Dr. Smith
# Instrument: Bruker Tracer 5g
# Voltage: 40 kV, Current: 30 µA
energy_kev,counts
0.50,123
0.75,156
1.00,234
1.25,345
1.50,567
1.75,432
2.00,678
2.25,543
2.50,890
2.75,765
3.00,1234
3.25,987
3.50,1567
3.75,1234
4.00,2345
4.25,1876
4.50,2678
4.75,2123
5.00,3456
```

> **Note:** Comment lines starting with `#` are automatically skipped by the parser.

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Data not loading | Check MIME type is `text/csv`, `text/plain`, or `text/tab-separated-values` |
| Wrong delimiter | Use consistent delimiter throughout file |
| Missing X column | Use recognized column name (see list above) |
| File too large | Reduce file size or pre-process data |
| Encoding issues | Save as UTF-8 without BOM |
| Empty plot | Check for header row and numeric values |

### Validation

Before publishing, verify your CSV file:

1. Opens correctly in a spreadsheet application
2. Has a header row with column names
3. Uses consistent delimiter
4. Contains only numeric values (except header)
5. Is under 5 MB
6. Is accessible via CORS-enabled server
