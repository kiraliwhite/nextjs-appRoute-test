import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config'; //導入authConfig設定檔
import { z } from 'zod';
import { sql } from '@vercel/postgres';
import type { User } from '@/app/lib/definitions';
import bcrypt from 'bcrypt';

async function getUser(email: string): Promise<User | undefined> {
  try {
    const user = await sql<User>`SELECT * FROM users WHERE email=${email}`;
    return user.rows[0];
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw new Error('Failed to fetch user.');
  }
}

//導出auth、signIn、signOut               使用...authConfig來初始化NextAuth
export const { auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    /**
     * credentials provider可讓您使用任意憑證進行登錄，例如使用者名稱和密碼、網域或2FA或硬體裝置（例如 YubiKey U2F / FIDO）。
     * 它旨在支援您擁有需要對使用者進行身份驗證的現有系統的用例。
     * 它具有這樣的限制：以這種方式進行身份驗證的使用者不會保留在資料庫中，因此只有在為session啟用 JSON Web token的情況下才能使用credentail provider。
     *
     * 警告 由於使用者名稱-密碼模型固有的安全性風險，故意限制為基於憑證credential的身份驗證authentication提供的功能，以阻止使用密碼。
     * OAuth provider花費大量金錢、時間和工程精力來建構：
     * 濫用檢測（機器人保護、速率限制）
     * 密碼管理（密碼重設、撞庫、輪替）
     * 資料安全（加密/加鹽、強度驗證）
     * 以及更多有關身份驗證解決方案的資訊。 您的應用程式很可能會受益於這些經過考驗的解決方案，而不是嘗試從頭開始重建它們。
     * 儘管存在這些風險，如果您仍然想為您的應用程式建立基於密碼的身份驗證，Auth.js 可以讓您完全控制這樣做。
     */
    Credentials({
      async authorize(credentials) {
        console.log(`credentials: ${JSON.stringify(credentials)}`);
        //使用 zod 抓取電子郵件和密碼，用戶傳進來的資料會被放在credentials裡面
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        console.log(
          `zod parsedCredentials: ${JSON.stringify(parsedCredentials)}`,
        );
        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;
          //使用用戶傳進來的email和密碼去資料庫抓取user
          const user = await getUser(email);
          //假設user不存在，就會回傳null
          if (!user) return null;
          //如果user存在，就會使用bcrypt.compare來比對密碼是否相同
          const passwordsMatch = await bcrypt.compare(password, user.password);

          //密碼相同回傳user
          if (passwordsMatch) return user;
        }

        console.log('Invalid credentials');
        return null;
      },
    }),
  ],
});
