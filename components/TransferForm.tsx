export function TransferForm({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action} className="flex flex-col gap-3 rounded border p-4">
      <h2 className="text-sm font-semibold">Transfer funds</h2>
      <p className="text-xs text-gray-600">
        Move fake cash from your external bank account into your brokerage
        account.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Amount (USD)
        <input
          type="text"
          inputMode="decimal"
          name="amount"
          placeholder="1000.00"
          required
          className="rounded border px-3 py-2"
        />
      </label>
      <button
        type="submit"
        className="self-start rounded bg-black px-4 py-2 text-sm text-white"
      >
        Transfer
      </button>
    </form>
  );
}
