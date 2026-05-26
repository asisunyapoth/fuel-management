import { redirect } from "next/navigation";

// DGA Digital ID manages account creation — no local sign-up flow needed.
export default function SignUpPage() {
  redirect("/sign-in");
}
