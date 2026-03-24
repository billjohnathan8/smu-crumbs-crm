import type { AccountCreateRequest, AccountType, AccountStatus } from '@/api/types'
import type { FormEvent } from 'react'

type ModalMode = 'create' | 'edit' | null

type AccountFormModalProps = {
  modalMode: Exclude<ModalMode, null>
  formData: AccountCreateRequest
  setFormData: React.Dispatch<React.SetStateAction<AccountCreateRequest>>
  formError: string
  isSubmitting: boolean
  onSubmit: (e: FormEvent) => void
  onClose: () => void
}

export function AccountFormModal({
  modalMode,
  formData,
  setFormData,
  formError,
  isSubmitting,
  onSubmit,
  onClose,
}: AccountFormModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      data-testid="account-modal"
    >
      <div className="bg-card  rounded-lg p-6 w-full max-w-lg mx-4">
        <h2 className="text-lg font-bold text-text mb-4">
          {modalMode === 'create' ? 'Create Account' : 'Edit Account'}
        </h2>

        {formError && (
          <div className="bg-danger/10 border border-danger rounded-lg p-3 mb-4">
            <p className="text-danger text-sm">{formError}</p>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-normal text-text mb-1">Client ID</label>
            <input
              type="text"
              value={formData.clientId}
              readOnly
              className="w-full px-4 py-2 bg-background-light  rounded-lg text-text-muted"
            />
          </div>

          <div>
            <label className="block text-sm font-normal text-text mb-1">Account Type</label>
            <select
              value={formData.accountType}
              onChange={e =>
                setFormData({ ...formData, accountType: e.target.value as AccountType })
              }
              className="w-full px-4 py-2 bg-background-light  rounded-lg text-text"
              disabled={isSubmitting}
            >
              <option value="Savings">Savings</option>
              <option value="Checking">Checking</option>
              <option value="Business">Business</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-normal text-text mb-1">Account Status</label>
            <select
              value={formData.accountStatus}
              onChange={e =>
                setFormData({ ...formData, accountStatus: e.target.value as AccountStatus })
              }
              className="w-full px-4 py-2 bg-background-light  rounded-lg text-text"
              disabled={isSubmitting}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Pending">Pending</option>
            </select>
          </div>

          {modalMode === 'create' && (
            <>
              <div>
                <label className="block text-sm font-normal text-text mb-1">
                  Initial Deposit (SGD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.initialDeposit}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      initialDeposit: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-4 py-2 bg-background-light  rounded-lg text-text"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-normal text-text mb-1">Currency</label>
                <input
                  type="text"
                  value={formData.currency}
                  onChange={e => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full px-4 py-2 bg-background-light  rounded-lg text-text"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-normal text-text mb-1">Opening Date</label>
                <input
                  type="date"
                  value={formData.openingDate}
                  onChange={e => setFormData({ ...formData, openingDate: e.target.value })}
                  className="w-full px-4 py-2 bg-background-light  rounded-lg text-text"
                  disabled={isSubmitting}
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-normal text-text mb-1">
              Branch ID <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={formData.branchId}
              onChange={e => setFormData({ ...formData, branchId: e.target.value })}
              className="w-full px-4 py-2 bg-background-light  rounded-lg text-text"
              disabled={isSubmitting}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-background-light hover:bg-background-lighter text-text rounded-lg text-sm font-normal"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-normal disabled:opacity-50"
            >
              {isSubmitting
                ? 'Saving...'
                : modalMode === 'create'
                  ? 'Create Account'
                  : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
