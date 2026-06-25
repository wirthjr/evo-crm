# == Schema Information
#
# Table name: attendant_sessions
#
#  id         :uuid             not null, primary key
#  user_id    :uuid             not null
#  status     :string           default("active"), not null
#  started_at :datetime         not null
#  ended_at   :datetime
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
# Indexes
#
#  index_attendant_sessions_on_user_id          (user_id)
#  index_attendant_sessions_on_status           (status)
#  index_attendant_sessions_on_user_id_and_status (user_id,status)
#
class AttendantSession < ApplicationRecord
  belongs_to :user

  validates :user_id, presence: true
  validates :status, presence: true, inclusion: { in: %w[active inactive] }
  validates :started_at, presence: true

  validate :one_active_session_per_user, on: :create

  scope :active, -> { where(status: 'active', ended_at: nil) }
  scope :inactive, -> { where(status: 'inactive').or(where.not(ended_at: nil)) }
  scope :recent, -> { order(started_at: :desc) }

  def finish!
    update!(status: 'inactive', ended_at: Time.current)
  end

  def active?
    status == 'active' && ended_at.nil?
  end

  private

  def one_active_session_per_user
    return unless status == 'active' && ended_at.nil?

    if self.class.active.exists?(user_id: user_id)
      errors.add(:user_id, 'already has an active work session')
    end
  end
end
