'use server';

import { z } from 'zod';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

//用於驗證登入的function
export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}

/* 以下是用於發票相關的function */

//使用zod的物件來驗證資料的型別
const FormSchema = z.object({
  id: z.string(),
  //當不正確的資料型別時，會顯示invalid_type_error的訊息
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce
    .number()
    //當amount沒有大於0時，會顯示message的訊息
    .gt(0, { message: 'Please enter an amount greater than 0.' }),

  //當status不是pending或paid時，會顯示invalid_type_error的訊息
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select an invoice status.',
  }),
  date: z.string(),
});

//使用omit來排除不需要驗證的欄位，不需要驗證id是因為id由資料庫產生，日期則是今天的日期
const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

//暫時的型別定義，用來定義errors和message這個物件有這些型別，直到更新 @types/react-dom 的型別定義，就會被拿掉
export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

//當發票要建立時，會呼叫此function，輸入的是來自表單的資料
//prevState是用來儲存錯誤訊息的物件，formData是表單的資料，prevState的型別是State，formData的型別是FormData
//prevState - 包含從 useFormState Hook傳遞的State。您不會在本例的操作中使用它，但它是必需的Props。
//prevState也就是在app/ui/invoices/create-form.tsx宣告的useFormState的initialState，就是{ message: null, errors: {} }物件
export async function createInvoice(prevState: State, formData: FormData) {
  console.log(
    `prevState is useFormState's initialState: ${JSON.stringify(prevState)}`,
  );

  //使用zod的CreateInvoice物件來驗證資料，safeParse() 將傳回一個包含成功或錯誤欄位的物件。這將有助於更優雅地處理驗證，而無需將此邏輯放入 try/catch 區塊中。
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'), //使用get來取得表單的資料
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  console.log(`validatedFields : ${JSON.stringify(validatedFields)}`);

  //假設safeParse回傳的結果validatedFields這個物件沒有success屬性，就會retrun這整個createInvoice function並return錯誤訊息。
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    };
  }

  const { customerId, amount, status } = validatedFields.data;
  //把金額單位從美元轉成美分
  const amountInCents = amount * 100;
  //今天的日期
  const date = new Date().toISOString().split('T')[0];

  //用insert來把表單資料寫入到資料庫
  try {
    await sql`
  INSERT INTO invoices (customer_id, amount, status, date)
  VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
`;
  } catch (error) {
    return {
      message: 'Database Error: Failed to Create Invoice',
    };
  }

  //由於表單資料已經寫入到資料庫，所以要更新發票列表的快取，所以使用revalidatePath來更新快取
  revalidatePath('/dashboard/invoices');
  //表單送出之後把用戶頁面重新導向到發票列表
  redirect('/dashboard/invoices');
}

//當發票要更新時，會呼叫此function，先用id取得特定已經存在的發票，然後用formdata來更新發票
export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData,
) {
  const validatedFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  console.log(
    `updateInvoice validatedFields: ${JSON.stringify(validatedFields)}`,
  );

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
    };
  }

  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;

  //在sql中使用update來更新資料庫中的資料，使用where來指定要更新的特定發票
  try {
    await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
    `;
  } catch (error) {
    return {
      message: 'Database Error: Failed to Update Invoice',
    };
  }

  //更新發票列表以及重新導向到發票列表
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`;
    revalidatePath('/dashboard/invoices');
    return { message: 'Deleted Invoice.' };
  } catch (error) {
    return { message: 'Database Error: Failed to Delete Invoice.' };
  }
}
