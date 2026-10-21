/**
 * Checks a file before it is sent, so an obvious mistake gets an instant,
 * specific message. The server still inspects the archive and has the final
 * say.
 *
 * @param fileName - Name of the chosen file
 * @param sizeBytes - Size of the chosen file
 * @returns A message describing the problem, or `null` when the file may be sent
 */
export function checkPackageFile(
  fileName: string,
  sizeBytes: number,
): string | null {
  if (sizeBytes === 0) {
    return `"${fileName}" is empty.`;
  }
  if (!fileName.toLowerCase().endsWith('.zip')) {
    return `"${fileName}" is not a .zip file. Packages are uploaded as ZIP archives.`;
  }
  return null;
}
