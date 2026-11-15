import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';

const outputPath = process.argv[2] ?? '/private/tmp/gather-office-continuous-tone.wav';
const sampleRate = 48_000;
const seconds = 3;
const frequencyHz = 440;
const amplitude = 9_000;
const frameCount = sampleRate * seconds;
const pcmByteLength = frameCount * 2;
const wav = Buffer.alloc(44 + pcmByteLength);

wav.write('RIFF', 0, 'ascii');
wav.writeUInt32LE(36 + pcmByteLength, 4);
wav.write('WAVE', 8, 'ascii');
wav.write('fmt ', 12, 'ascii');
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); // PCM
wav.writeUInt16LE(1, 22); // mono
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36, 'ascii');
wav.writeUInt32LE(pcmByteLength, 40);

for (let frame = 0; frame < frameCount; frame += 1) {
  const sample = Math.round(amplitude * Math.sin((2 * Math.PI * frequencyHz * frame) / sampleRate));
  wav.writeInt16LE(sample, 44 + frame * 2);
}

await writeFile(outputPath, wav);
process.stdout.write(`${outputPath}\n`);
