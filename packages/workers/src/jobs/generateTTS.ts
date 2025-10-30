import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

export async function generateTTS(db: Pool, logger: Logger) {
  logger.info('Generating TTS audio files...');

  // Metric explanations (Hindi)
  const explanations = [
    {
      key: 'metric_person_days',
      text: 'व्यक्ति-दिवस का मतलब है कुल काम के दिन जो सभी लोगों को मिले',
      lang: 'hi'
    },
    {
      key: 'metric_households',
      text: 'परिवारों की संख्या जिन्हें इस महीने काम मिला',
      lang: 'hi'
    },
    {
      key: 'metric_payments',
      text: 'समय पर भुगतान प्रतिशत दिखाता है कि कितने भुगतान समय पर हुए',
      lang: 'hi'
    }
  ];

  for (const { key, text, lang } of explanations) {
    try {
      const audioPath = await generateAudioFile(text, lang);
      const s3Key = `audio/${key}.mp3`;
      
      // Upload to S3
      const fileContent = readFileSync(audioPath);
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'audio/mpeg'
      }));

      // Cache in DB
      await db.query(
        `INSERT INTO audio_cache (text_key, text_content, language, audio_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (text_key) DO UPDATE SET audio_url = EXCLUDED.audio_url`,
        [key, text, lang, `https://${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${s3Key}`]
      );

      unlinkSync(audioPath);
      logger.info(`Generated TTS: ${key}`);
    } catch (error) {
      logger.error(`Failed to generate TTS for ${key}:`, error);
    }
  }

  logger.info('✅ TTS generation completed');
}

function generateAudioFile(text: string, lang: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const tempFile = join('/tmp', `tts_${Date.now()}.mp3`);
      
      // Using espeak-ng (install: apt-get install espeak-ng)
      execSync(
        `espeak-ng -v ${lang} -w ${tempFile}.wav "${text}" && ffmpeg -i ${tempFile}.wav -acodec libmp3lame ${tempFile}`,
        { timeout: 10000 }
      );
      
      resolve(tempFile);
    } catch (error) {
      reject(error);
    }
  });
}
