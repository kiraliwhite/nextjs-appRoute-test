import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  //指定登入頁面是app/login
  pages: {
    signIn: '/login',
  },
  callbacks: {
    //auth是登入資訊包含使用者的session，如果未授權就會是null
    //request是用戶傳入的請求，是一個物件包含URL。
    //request: { nextUrl }代表只提取request物件裡面的nextUrl屬性
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      //如果request的路徑是從dashboard開始，就會是true
      const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirect unauthenticated users to login page
      } else if (isLoggedIn) {
        //如果已經登入，就會導向dashboard底下，request所要求的路徑
        return Response.redirect(new URL('/dashboard', nextUrl));
      }
      return true;
    },
  },
  providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;
